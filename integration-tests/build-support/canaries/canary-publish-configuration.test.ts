import assert from 'node:assert';
import fileSystem from 'node:fs';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { pathToFileURL as pathToFileAddress } from 'node:url';
import { suite, test } from 'mocha';
import { runSelectedCanary } from '../../../source/build-support/canaries/canary-runner.ts';
import { createFileManager, type FileManager } from '../../../source/file-manager/file-manager.ts';
import { createNativeCanaryRuntime } from './native-runtime.ts';

const originalConfiguration = {
    commonPackageSettings: {
        deadCodeElimination: {
            enabled: false
        },
        publishSettings: {
            softwareBillOfMaterials: {
                enabled: true
            }
        }
    },
    packages: [ {
        name: 'sample',
        deadCodeElimination: {
            enabled: false
        },
        publishSettings: {
            softwareBillOfMaterials: {
                enabled: true
            }
        }
    } ]
};
const packedConfiguration = {
    commonPackageSettings: {
        deadCodeElimination: {
            enabled: true
        },
        publishSettings: {
            softwareBillOfMaterials: {
                enabled: false
            }
        }
    },
    packages: [ {
        name: 'sample',
        deadCodeElimination: {
            enabled: true
        },
        publishSettings: {
            softwareBillOfMaterials: {
                enabled: false
            }
        }
    } ]
};
type ConfigurationObservation = {
    readonly mode: string;
    readonly phase: string;
    readonly configuration: typeof originalConfiguration;
};
async function artifactSettingsForPhase(cwd: string, phase: string): Promise<ConfigurationObservation> {
    const configurationAddress = pathToFileAddress(path.join(cwd, 'packtory.config.js'));
    configurationAddress.searchParams.set('phase', phase);
    const module = (await import(configurationAddress.href)) as {
        readonly buildConfiguration: () => Promise<typeof originalConfiguration>;
    };
    return {
        mode: cwd.includes('-baseline-') ? 'baseline' : 'candidate',
        phase,
        configuration: await module.buildConfiguration()
    };
}
async function writeDownstreamFixture(fileManager: Pick<FileManager, 'writeFile'>, cwd: string): Promise<void> {
    await fileManager.writeFile(path.join(cwd, 'package.json'), '{"type":"module"}');
    await fileManager.writeFile(
        path.join(cwd, 'packtory.config.js'),
        `export async function buildConfiguration() { return ${JSON.stringify(originalConfiguration)}; }\n`
    );
}

async function installFixtureExecutable(fileManager: Pick<FileManager, 'writeFile'>, cwd: string): Promise<void> {
    await fileManager.writeFile(path.join(cwd, 'node_modules', 'cli.js'), 'npm baseline');
    await mkdir(path.join(cwd, 'node_modules', '.bin'));
    await symlink('../cli.js', path.join(cwd, 'node_modules', '.bin', 'packtory'));
}

async function prepareDownstreamFixture(
    fileManager: Pick<FileManager, 'writeFile'>,
    recordPreparation: (command: string) => void,
    command: string,
    cwd: string
): Promise<void> {
    if (command.startsWith('git clone ')) {
        recordPreparation('clone');
        await writeDownstreamFixture(fileManager, cwd);
    } else if (command === 'npm clean-install --ignore-scripts') {
        recordPreparation('install');
        await installFixtureExecutable(fileManager, cwd);
    } else if (command === 'build') {
        recordPreparation('build');
        await fileManager.writeFile(path.join(cwd, 'build', 'package.js'), 'shared build');
    }
}

async function observePublish(
    fileManager: Pick<FileManager, 'readFile'>,
    cwd: string
): Promise<ConfigurationObservation> {
    const builtArtifact = await fileManager.readFile(path.join(cwd, 'build', 'package.js'));
    assert.strictEqual(builtArtifact, 'shared build');
    const executable = await fileManager.readFile(path.join(cwd, 'node_modules', '.bin', 'packtory'));
    if (cwd.includes('-baseline-')) {
        assert.strictEqual(executable, 'npm baseline');
    } else {
        assert.match(executable, /command-line-interface\.entry-point\.ts/u);
    }
    return await artifactSettingsForPhase(cwd, 'publish');
}

type CanaryFixtureObservations = {
    readonly recordConfiguration: (observation: ConfigurationObservation) => void;
    readonly recordPreparation: (command: string) => void;
};

async function runFixtureCanary(
    root: string,
    observations: CanaryFixtureObservations
): ReturnType<typeof runSelectedCanary> {
    const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });
    const manifestPath = path.join(root, 'canaries.json');
    await fileManager.writeFile(
        manifestPath,
        JSON.stringify([ {
            failureMode: 'non-blocking',
            installCommand: 'npm clean-install --ignore-scripts',
            name: 'sample',
            packBudgetMilliseconds: 1000,
            buildCommand: 'build',
            verificationCommands: [ 'publish-dry-run' ],
            reference: 'main',
            repository: 'https://github.com/enormora/sample.git'
        } ])
    );
    return await runSelectedCanary(manifestPath, 'sample', {
        ...createNativeCanaryRuntime(),
        async createTemporaryFolder(prefix) {
            return await mkdtemp(path.join(root, prefix));
        },
        fileManager,
        now() {
            return 0;
        },
        recordPackDuration() {
            return undefined;
        },
        async removeFolder(folderPath) {
            await rm(folderPath, { recursive: true, force: true });
        },
        repositoryFolder: root,
        async runCommand(command, cwd) {
            if (command === 'git rev-parse HEAD') {
                return { standardError: '', standardOutput: 'resolved-ref\n' };
            }
            if (command === 'publish-dry-run') {
                observations.recordConfiguration(await observePublish(fileManager, cwd));
            } else if (command.startsWith('packtory pack --all ')) {
                observations.recordConfiguration(await artifactSettingsForPhase(cwd, 'pack'));
                await mkdir(path.join(cwd, 'packtory-canary-packages', 'node_modules'), { recursive: true });
            } else {
                await prepareDownstreamFixture(fileManager, observations.recordPreparation, command, cwd);
            }
            return { standardError: '', standardOutput: '' };
        }
    });
}

suite('canary-publish-config', function () {
    test('shares build artifacts while keeping each CLI and its publish configuration isolated', async function () {
        const root = await mkdtemp(path.join(temporaryDirectory(), 'packtory-canary-publish-config-'));
        const observations: ConfigurationObservation[] = [];
        const preparationCommands: string[] = [];
        try {
            const result = await runFixtureCanary(root, {
                recordConfiguration(observation) {
                    observations.push(observation);
                },
                recordPreparation(command) {
                    preparationCommands.push(command);
                }
            });
            assert.deepStrictEqual(result, {
                baselineResolvedReference: 'resolved-ref',
                candidateResolvedReference: 'resolved-ref',
                issues: [],
                name: 'sample'
            });
            assert.deepStrictEqual(preparationCommands, [ 'clone', 'install', 'build' ]);
            assert.deepStrictEqual(observations, [ {
                mode: 'baseline',
                phase: 'publish',
                configuration: originalConfiguration
            }, {
                mode: 'baseline',
                phase: 'pack',
                configuration: packedConfiguration
            }, {
                mode: 'candidate',
                phase: 'publish',
                configuration: originalConfiguration
            }, {
                mode: 'candidate',
                phase: 'pack',
                configuration: packedConfiguration
            } ]);
        } finally {
            await rm(root, {
                recursive: true,
                force: true
            });
        }
    });
});
