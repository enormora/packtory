import assert from 'node:assert';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { runSelectedCanary, runShellCommand, type CanaryRunnerDependencies } from './canary-runner.ts';

type CommandCall = {
    readonly command: string;
    readonly cwd: string;
};

function commandIndex(
    commandCalls: readonly CommandCall[],
    cwd: string,
    command: string
): number {
    return commandCalls.findIndex(function (call) {
        return call.cwd === cwd && call.command === command;
    });
}

function assertTagsFetchedBeforeRef(commandCalls: readonly CommandCall[]): void {
    for (
        const folderPath of [
            '/workspace/packtory-canary-sample-baseline-clone',
            '/workspace/packtory-canary-sample-candidate-clone'
        ]
    ) {
        const fetchIndex = commandIndex(commandCalls, folderPath, 'git fetch --tags --force');
        const refIndex = commandIndex(commandCalls, folderPath, 'git rev-parse HEAD');
        assert.ok(fetchIndex >= 0);
        assert.ok(refIndex >= 0);
        assert.ok(fetchIndex < refIndex);
    }
}

async function withTemporaryShellPackage<T>(action: (folderPath: string) => Promise<T>): Promise<T> {
    const folderPath = await mkdtemp(path.join(tmpdir(), 'packtory-canary-runner-'));
    try {
        await mkdir(path.join(folderPath, 'node_modules', '.bin'), { recursive: true });
        return await action(folderPath);
    } finally {
        await rm(folderPath, { recursive: true, force: true });
    }
}

function manifestContent(publishCommand: string): string {
    return JSON.stringify([
        {
            failureMode: 'non-blocking',
            installCommand: 'npm clean-install --ignore-scripts',
            name: 'sample',
            publishCommand,
            ref: 'main',
            repository: 'https://github.com/enormora/sample.git'
        }
    ]);
}

function cloneMode(cwd: string): 'baseline' | 'candidate' {
    return cwd.includes('baseline') ? 'baseline' : 'candidate';
}

function createRunnerDependencies(
    publishCommand: string,
    failingModes: ReadonlySet<'baseline' | 'candidate'>
): CanaryRunnerDependencies & {
    readonly commandCalls: readonly CommandCall[];
    readonly removedFolders: readonly string[];
} {
    const commandCalls: CommandCall[] = [];
    const removedFolders: string[] = [];
    return {
        commandCalls,
        async createTemporaryFolder(prefix) {
            return `/workspace/${prefix}clone`;
        },
        fileManager: createFakeFileManager({
            simulatedReadFileResponses: [ { value: manifestContent(publishCommand) } ]
        }),
        async removeFolder(folderPath) {
            removedFolders.push(folderPath);
        },
        removedFolders,
        repositoryFolder: '/repo',
        async runCommand(command, cwd) {
            commandCalls.push({ command, cwd });
            if (command === 'git rev-parse HEAD') {
                return { stderr: '', stdout: `${cloneMode(cwd)}-ref\n` };
            }
            if (command === publishCommand && failingModes.has(cloneMode(cwd))) {
                throw new Error(`${cloneMode(cwd)} failed`);
            }
            return { stderr: '', stdout: '' };
        }
    };
}

suite('canary-runner', function () {
    test('runShellCommand uses the clone-local package bin path and dry-run token', async function () {
        await withTemporaryShellPackage(async function (folderPath) {
            const executablePath = path.join(folderPath, 'node_modules', '.bin', 'print-token');
            await writeFile(executablePath, '#!/usr/bin/env sh\nprintf "%s" "$NPM_TOKEN"\n');
            await chmod(executablePath, 0o755);

            assert.deepStrictEqual(await runShellCommand('print-token', folderPath), {
                stderr: '',
                stdout: 'dry-run'
            });
        });
    });

    test('runSelectedCanary reports source failures as regressions', async function () {
        const dependencies = createRunnerDependencies('npx just publish-dry-run', new Set([ 'candidate' ]));

        const result = await runSelectedCanary('canaries.json', 'sample', dependencies);

        assert.deepStrictEqual(result, {
            baselineResolvedRef: 'baseline-ref',
            candidateResolvedRef: 'candidate-ref',
            issues: [
                {
                    kind: 'regression',
                    message: [
                        'source run failed while running "npx just publish-dry-run" after the npm baseline passed:',
                        'candidate failed'
                    ]
                        .join('\n')
                }
            ],
            name: 'sample'
        });
        assert.strictEqual(
            dependencies.commandCalls.some(function (call) {
                return call.command.startsWith('packtory pack --all');
            }),
            true
        );
        assertTagsFetchedBeforeRef(dependencies.commandCalls);
        assert.deepStrictEqual(
            dependencies.removedFolders.toSorted(function (left, right) {
                return left.localeCompare(right);
            }),
            [
                '/workspace/packtory-canary-sample-baseline-clone',
                '/workspace/packtory-canary-sample-candidate-clone'
            ]
        );
    });

    test('runSelectedCanary reports shared downstream failures as baseline rot', async function () {
        const dependencies = createRunnerDependencies(
            'npx just publish-dry-run',
            new Set([ 'baseline', 'candidate' ])
        );

        const result = await runSelectedCanary('canaries.json', 'sample', dependencies);

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'baseline-rot',
                message: [
                    'npm baseline failed while running "npx just publish-dry-run":',
                    'baseline failed'
                ]
                    .join('\n')
            },
            {
                kind: 'baseline-rot',
                message: [
                    'source run also failed while running "npx just publish-dry-run":',
                    'candidate failed'
                ]
                    .join('\n')
            }
        ]);
    });

    test('runSelectedCanary reports a broken npm baseline without hiding source success', async function () {
        const dependencies = createRunnerDependencies('npx just publish-dry-run', new Set([ 'baseline' ]));

        const result = await runSelectedCanary('canaries.json', 'sample', dependencies);

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'baseline-rot',
                message: [
                    'npm baseline failed while running "npx just publish-dry-run":',
                    'baseline failed'
                ]
                    .join('\n')
            },
            { kind: 'warning', message: 'source run passed while the npm baseline failed' }
        ]);
    });
});
