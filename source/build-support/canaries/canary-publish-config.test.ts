import assert from 'node:assert';
import fs from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'mocha';
import { createFileManager, type FileManager } from '../../file-manager/file-manager.ts';
import { runSelectedCanary } from './canary-runner.ts';

const originalConfig = {
    commonPackageSettings: {
        deadCodeElimination: { enabled: false },
        publishSettings: { sbom: { enabled: true } }
    },
    packages: [ {
        name: 'sample',
        deadCodeElimination: { enabled: false },
        publishSettings: { sbom: { enabled: true } }
    } ]
};

const packedConfig = {
    commonPackageSettings: {
        deadCodeElimination: { enabled: true },
        publishSettings: { sbom: { enabled: false } }
    },
    packages: [ {
        name: 'sample',
        deadCodeElimination: { enabled: true },
        publishSettings: { sbom: { enabled: false } }
    } ]
};

type ConfigObservation = {
    readonly mode: string;
    readonly phase: string;
    readonly config: typeof originalConfig;
};

async function artifactSettingsForPhase(cwd: string, phase: string): Promise<ConfigObservation> {
    const configUrl = pathToFileURL(path.join(cwd, 'packtory.config.js'));
    configUrl.searchParams.set('phase', phase);
    const module = await import(configUrl.href) as {
        readonly buildConfig: () => Promise<typeof originalConfig>;
    };
    return {
        mode: cwd.includes('-baseline-') ? 'baseline' : 'candidate',
        phase,
        config: await module.buildConfig()
    };
}

async function writeDownstreamFixture(fileManager: Pick<FileManager, 'writeFile'>, cwd: string): Promise<void> {
    await fileManager.writeFile(path.join(cwd, 'package.json'), '{"type":"module"}');
    await fileManager.writeFile(
        path.join(cwd, 'packtory.config.js'),
        `export async function buildConfig() { return ${JSON.stringify(originalConfig)}; }\n`
    );
}

suite('canary-publish-config', function () {
    test('runSelectedCanary preserves publish artifacts and applies the overlay only when packing', async function () {
        const root = await mkdtemp(path.join(tmpdir(), 'packtory-canary-publish-config-'));
        const fileManager = createFileManager({ hostFileSystem: fs.promises });
        const observations: ConfigObservation[] = [];
        const manifestPath = path.join(root, 'canaries.json');
        try {
            await fileManager.writeFile(
                manifestPath,
                JSON.stringify([ {
                    failureMode: 'non-blocking',
                    installCommand: 'npm clean-install --ignore-scripts',
                    name: 'sample',
                    publishCommand: 'publish-dry-run',
                    ref: 'main',
                    repository: 'https://github.com/enormora/sample.git'
                } ])
            );

            const result = await runSelectedCanary(manifestPath, 'sample', {
                async createTemporaryFolder(prefix) {
                    return await mkdtemp(path.join(root, prefix));
                },
                fileManager,
                async removeFolder(folderPath) {
                    await rm(folderPath, { recursive: true, force: true });
                },
                repositoryFolder: root,
                async runCommand(command, cwd) {
                    if (command.startsWith('git clone ')) {
                        await writeDownstreamFixture(fileManager, cwd);
                    }
                    if (command === 'git rev-parse HEAD') {
                        return { stderr: '', stdout: 'resolved-ref\n' };
                    }
                    if (command === 'publish-dry-run') {
                        observations.push(await artifactSettingsForPhase(cwd, 'publish'));
                    }
                    if (command.startsWith('packtory pack --all ')) {
                        observations.push(await artifactSettingsForPhase(cwd, 'pack'));
                        await mkdir(path.join(cwd, 'packtory-canary-packages', 'node_modules'), {
                            recursive: true
                        });
                    }
                    return { stderr: '', stdout: '' };
                }
            });

            assert.deepStrictEqual(result, {
                baselineResolvedRef: 'resolved-ref',
                candidateResolvedRef: 'resolved-ref',
                issues: [],
                name: 'sample'
            });
            assert.deepStrictEqual(
                observations,
                [
                    { mode: 'baseline', phase: 'publish', config: originalConfig },
                    { mode: 'baseline', phase: 'pack', config: packedConfig },
                    { mode: 'candidate', phase: 'publish', config: originalConfig },
                    { mode: 'candidate', phase: 'pack', config: packedConfig }
                ]
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
