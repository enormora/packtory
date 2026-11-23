import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createFakeFileManager, type FakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { rejectWithNonError } from '../../test-libraries/non-error-failures.ts';
import { runSelectedCanary, type CanaryRunnerDependencies } from './canary-runner.ts';

type CommandCall = {
    readonly command: string;
    readonly cwd: string;
};
function commandIndex(commandCalls: readonly CommandCall[], cwd: string, command: string): number {
    return commandCalls.findIndex(function (call) {
        return call.cwd === cwd && call.command === command;
    });
}
function assertTagsFetchedBeforeReference(commandCalls: readonly CommandCall[]): void {
    const folderPath = '/workspace/packtory-canary-sample-baseline-clone';
    const fetchIndex = commandIndex(commandCalls, folderPath, 'git fetch --tags --force');
    const referenceIndex = commandIndex(commandCalls, folderPath, 'git rev-parse HEAD');
    assert.ok(fetchIndex >= 0);
    assert.ok(referenceIndex >= 0);
    assert.ok(fetchIndex < referenceIndex);
}

type CanaryCommand = { readonly buildCommand: string; } | { readonly publishCommand: string; };

function manifestContent(canaryCommand: CanaryCommand, verificationCommands: readonly string[]): string {
    return JSON.stringify([
        {
            failureMode: 'non-blocking',
            installCommand: 'npm clean-install --ignore-scripts',
            name: 'sample',
            packBudgetMilliseconds: 1000,
            ...canaryCommand,
            verificationCommands,
            reference: 'main',
            repository: 'https://github.com/enormora/sample.git'
        }
    ]);
}
function cloneMode(cwd: string): 'baseline' | 'candidate' {
    return cwd.includes('baseline') ? 'baseline' : 'candidate';
}
function createRunnerDependencies(
    canaryCommand: CanaryCommand,
    failingModes: ReadonlySet<'baseline' | 'candidate'>,
    verificationCommands: readonly string[]
): CanaryRunnerDependencies & {
    readonly commandCalls: readonly CommandCall[];
    readonly fileManager: FakeFileManager;
    readonly removedFolders: readonly string[];
} {
    const commandCalls: CommandCall[] = [];
    const removedFolders: string[] = [];
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [ { value: manifestContent(canaryCommand, verificationCommands) } ]
    });
    const [ canaryBuildCommand ] = Object.values<string>(canaryCommand);
    return {
        createProject() {
            throw new Error('Unexpected type inspection');
        },
        async runImportProbe() {
            throw new Error('Unexpected runtime import');
        },
        commandCalls,
        async createTemporaryFolder(prefix) {
            return `/workspace/${prefix}clone`;
        },
        fileManager,
        now() {
            return 0;
        },
        recordPackDuration() {
            return undefined;
        },
        async removeFolder(folderPath) {
            removedFolders.push(folderPath);
        },
        removedFolders,
        repositoryFolder: '/repo',
        async runCommand(command, cwd) {
            commandCalls.push({
                command,
                cwd
            });
            if (command === 'git rev-parse HEAD') {
                return {
                    standardError: '',
                    standardOutput: `${cloneMode(cwd)}-ref\n`
                };
            }
            if (command === canaryBuildCommand && failingModes.has(cloneMode(cwd))) {
                throw new Error(`${cloneMode(cwd)} failed`);
            }
            return {
                standardError: '',
                standardOutput: ''
            };
        }
    };
}

suite('canary-runner', function () {
    test('reports a shared build failure once and skips both packaging runs', async function () {
        const dependencies = createRunnerDependencies({ buildCommand: 'compile' }, new Set([ 'baseline' ]), []);
        const result = await runSelectedCanary('canaries.json', 'sample', dependencies);

        assert.deepStrictEqual(result.issues, [ {
            kind: 'baseline-rot',
            message: 'Shared downstream build failed while running "compile":\nbaseline failed'
        } ]);
        assert.deepStrictEqual(dependencies.removedFolders, [ '/workspace/packtory-canary-sample-baseline-clone' ]);
        assert.strictEqual(
            dependencies.commandCalls.some(function ({ command }) {
                return command.startsWith('packtory pack --all ');
            }),
            false
        );
    });

    suite('verification commands', function () {
        test('runs verification commands after preparation and before packing each clone', async function () {
            const dependencies = createRunnerDependencies({ buildCommand: 'compile' }, new Set(), [
                'verify-first',
                'verify-second'
            ]);

            await runSelectedCanary('canaries.json', 'sample', dependencies);

            const phases = dependencies
                .commandCalls
                .filter(function isPackagingStep({ command }) {
                    return command === 'compile' || command.startsWith('verify-') ||
                        command.startsWith('packtory pack --all ');
                })
                .map(function ({ command }) {
                    return command.startsWith('packtory pack --all ') ? 'pack' : command;
                });
            assert.deepStrictEqual(phases, [
                'compile',
                'verify-first',
                'verify-second',
                'pack',
                'verify-first',
                'verify-second',
                'pack'
            ]);
        });

        for (const failedMode of [ 'baseline', 'candidate' ] as const) {
            test(`reports verification failures in the ${failedMode} clone`, async function () {
                const dependencies = createRunnerDependencies({ publishCommand: 'compile' }, new Set(), [ 'verify' ]);
                const result = await runSelectedCanary('canaries.json', 'sample', {
                    ...dependencies,
                    async runCommand(command, cwd) {
                        if (command === 'verify' && cloneMode(cwd) === failedMode) {
                            throw new Error('verification failed');
                        }
                        return dependencies.runCommand(command, cwd);
                    }
                });
                const issue = result.issues.find(function reportsVerificationFailure(candidate) {
                    return candidate.message.includes('verification failed');
                });

                assertDefined(issue);
                assert.strictEqual(issue.kind, failedMode === 'baseline' ? 'baseline-rot' : 'regression');
            });
        }
    });

    test('runSelectedCanary reports source failures as regressions', async function () {
        const dependencies = createRunnerDependencies(
            { publishCommand: 'npx just publish-dry-run' },
            new Set([ 'candidate' ]),
            []
        );

        const result = await runSelectedCanary('canaries.json', 'sample', dependencies);
        assert.deepStrictEqual(result, {
            baselineResolvedReference: 'baseline-ref',
            candidateResolvedReference: 'baseline-ref',
            issues: [ {
                kind: 'regression',
                message: [
                    'source run failed while running "npx just publish-dry-run" after the npm baseline passed:',
                    'candidate failed'
                ]
                    .join('\n')
            } ],
            name: 'sample'
        });
        assert.strictEqual(
            dependencies.commandCalls.some(function (call) {
                return call.command.startsWith('packtory pack --all');
            }),
            true
        );
        assertTagsFetchedBeforeReference(dependencies.commandCalls);
        assert.deepStrictEqual(
            dependencies
                .commandCalls
                .filter(function ({ command }) {
                    return command === 'npm clean-install --ignore-scripts';
                })
                .map(function ({ cwd }) {
                    return cwd;
                })
                .toSorted(function (left, right) {
                    return left.localeCompare(right);
                }),
            [ '/workspace/packtory-canary-sample-baseline-clone', '/workspace/packtory-canary-sample-candidate-clone' ]
        );
        assert.deepStrictEqual(
            dependencies.removedFolders.toSorted(function (left, right) {
                return left.localeCompare(right);
            }),
            [ '/workspace/packtory-canary-sample-baseline-clone', '/workspace/packtory-canary-sample-candidate-clone' ]
        );
        assert.deepStrictEqual(
            dependencies.commandCalls.filter(function (call) {
                return call.command === 'npm install --no-save --ignore-scripts @packtory/cli@latest';
            }),
            [ {
                command: 'npm install --no-save --ignore-scripts @packtory/cli@latest',
                cwd: '/workspace/packtory-canary-sample-baseline-clone'
            } ]
        );
        assert.strictEqual(
            dependencies.fileManager.getAllWriteFileCalls().some(function (call) {
                return call.filePath === '/workspace/packtory-canary-sample-baseline-clone/node_modules/.bin/packtory';
            }),
            false
        );
        assert.strictEqual(
            dependencies.fileManager.getAllWriteFileCalls().some(function (call) {
                const executable = '/workspace/packtory-canary-sample-candidate-clone/node_modules/.bin/packtory';
                return call.filePath === executable && call.content.includes('command-line-interface.entry-point.ts');
            }),
            true
        );
    });

    test('cleans up both clones when preparing one fails', async function () {
        const dependencies = createRunnerDependencies({ publishCommand: 'publish-dry-run' }, new Set(), []);
        await assert.rejects(async function () {
            await runSelectedCanary('canaries.json', 'sample', {
                ...dependencies,
                async runCommand(command, cwd) {
                    if (command.startsWith('npm install ') && cloneMode(cwd) === 'baseline') {
                        throw new Error('baseline install failed');
                    }
                    return await dependencies.runCommand(command, cwd);
                }
            });
        }, /baseline install failed/u);
        assert.deepStrictEqual(
            dependencies.removedFolders.toSorted(function (left, right) {
                return left.localeCompare(right);
            }),
            [ '/workspace/packtory-canary-sample-baseline-clone', '/workspace/packtory-canary-sample-candidate-clone' ]
        );
    });

    test('runSelectedCanary reports shared downstream failures as baseline rot', async function () {
        const dependencies = createRunnerDependencies(
            { publishCommand: 'npx just publish-dry-run' },
            new Set([ 'baseline', 'candidate' ]),
            []
        );

        const result = await runSelectedCanary('canaries.json', 'sample', dependencies);
        assert.deepStrictEqual(result.issues, [ {
            kind: 'baseline-rot',
            message: [ 'npm baseline failed while running "npx just publish-dry-run":', 'baseline failed' ].join('\n')
        }, {
            kind: 'baseline-rot',
            message: [ 'source run also failed while running "npx just publish-dry-run":', 'candidate failed' ].join(
                '\n'
            )
        } ]);
    });

    test('runSelectedCanary reports a broken npm baseline without hiding source success', async function () {
        const dependencies = createRunnerDependencies(
            { publishCommand: 'npx just publish-dry-run' },
            new Set([ 'baseline' ]),
            []
        );

        const result = await runSelectedCanary('canaries.json', 'sample', dependencies);
        assert.deepStrictEqual(result.issues, [ {
            kind: 'baseline-rot',
            message: [ 'npm baseline failed while running "npx just publish-dry-run":', 'baseline failed' ].join('\n')
        }, {
            kind: 'warning',
            message: 'source run passed while the npm baseline failed'
        } ]);
    });

    test('reports non-Error failures from downstream commands', async function () {
        const dependencies = createRunnerDependencies({ publishCommand: 'publish-dry-run' }, new Set(), []);
        const result = await runSelectedCanary('canaries.json', 'sample', {
            ...dependencies,
            async runCommand(command, cwd) {
                if (command === 'publish-dry-run') {
                    return rejectWithNonError('downstream failed');
                }
                return dependencies.runCommand(command, cwd);
            }
        });
        assert.deepStrictEqual(
            result.issues.map(function (issue) {
                return issue.message;
            }),
            [
                'npm baseline failed while running "publish-dry-run":\ndownstream failed',
                'source run also failed while running "publish-dry-run":\ndownstream failed'
            ]
        );
    });

    test('records the candidate pack duration before inspecting the packages', async function () {
        const dependencies = createRunnerDependencies({ publishCommand: 'compile' }, new Set(), []);
        const durations: number[] = [];
        let time = 0;
        const result = await runSelectedCanary('canaries.json', 'sample', {
            ...dependencies,
            fileManager: {
                ...dependencies.fileManager,
                async listDirectoryEntries(folderPath) {
                    if (cloneMode(folderPath) === 'candidate') {
                        throw new Error('candidate inspection failed');
                    }
                    return dependencies.fileManager.listDirectoryEntries(folderPath);
                }
            },
            now() {
                return time;
            },
            recordPackDuration(mode, duration) {
                if (mode === 'candidate') {
                    durations.push(duration);
                }
            },
            async runCommand(command, cwd) {
                time += command.startsWith('packtory pack --all ') ? 125 : 1000;
                return dependencies.runCommand(command, cwd);
            }
        });

        assert.deepStrictEqual(durations, [ 125 ]);
        assert.match(result.issues[0]?.message ?? '', /candidate inspection failed/u);
    });

    test('does not record a duration when candidate packing times out', async function () {
        const dependencies = createRunnerDependencies({ publishCommand: 'compile' }, new Set(), []);
        const measuredModes: string[] = [];
        const result = await runSelectedCanary('canaries.json', 'sample', {
            ...dependencies,
            recordPackDuration(mode) {
                measuredModes.push(mode);
            },
            async runCommand(command, cwd) {
                if (command.startsWith('packtory pack --all ') && cloneMode(cwd) === 'candidate') {
                    throw new Error('Pack command timed out');
                }
                return dependencies.runCommand(command, cwd);
            }
        });

        assert.deepStrictEqual(measuredModes, [ 'baseline' ]);
        assert.match(result.issues[0]?.message ?? '', /Pack command timed out/u);
    });

    test('compares successful baseline and source package surfaces', async function () {
        const dependencies = createRunnerDependencies({ publishCommand: 'pack' }, new Set(), []);
        const result = await runSelectedCanary('canaries.json', 'sample', dependencies);
        assert.deepStrictEqual(result, {
            name: 'sample',
            baselineResolvedReference: 'baseline-ref',
            candidateResolvedReference: 'baseline-ref',
            issues: []
        });
    });
});
