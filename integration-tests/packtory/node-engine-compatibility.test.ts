import assert from 'node:assert';
import path from 'node:path';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { suite, test } from 'mocha';
import type { Result } from 'true-myth';
import type { PacktoryConfigurationWithoutRegistry } from '../../source/configuration/configuration.ts';
import {
    buildAndPublishAll,
    packPackage,
    resolveAndLinkAll
} from '../../source/packages/packtory/packtory.entry-point.ts';

type EngineFixture = {
    readonly folder: string;
    readonly configuration: PacktoryConfigurationWithoutRegistry;
};

async function writeEngineFixture(folder: string, sourcesFolder: string, entry: string): Promise<void> {
    const directFolder = path.join(folder, 'node_modules/direct');
    const leafFolder = path.join(folder, 'node_modules/leaf');
    await mkdir(sourcesFolder, { recursive: true });
    await mkdir(directFolder, { recursive: true });
    await mkdir(leafFolder, { recursive: true });
    await writeFile(path.join(folder, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(sourcesFolder, 'index.js'), entry);
    await writeFile(
        path.join(directFolder, 'package.json'),
        JSON.stringify({
            name: 'direct',
            version: '1.0.0',
            type: 'module',
            exports: './index.js',
            sideEffects: false,
            dependencies: { leaf: '*' }
        })
    );
    await writeFile(path.join(directFolder, 'index.js'), 'export const value = 1;\n');
    await writeFile(
        path.join(leafFolder, 'package.json'),
        JSON.stringify({
            name: 'leaf',
            version: '2.0.0',
            engines: { node: '>=24' }
        })
    );
}

async function createEngineFixture(entry: string): Promise<EngineFixture> {
    const folder = await mkdtemp(path.join(tmpdir(), 'packtory-node-engine-'));
    const sourcesFolder = path.join(folder, 'source');
    await writeEngineFixture(folder, sourcesFolder, entry);
    return {
        folder,
        configuration: {
            commonPackageSettings: {
                sourcesFolder,
                mainPackageManifest: { type: 'module', dependencies: { direct: '*' } },
                publishSettings: { access: 'public' },
                additionalPackageManifestAttributes: { engines: { node: '>=22' } },
                deadCodeElimination: { enabled: true, pureImports: [ { from: 'direct' } ] }
            },
            checks: { nodeEngineCompatibility: { enabled: true } },
            packages: [ {
                name: 'engine-example',
                roots: { main: { javaScript: path.join(sourcesFolder, 'index.js') } }
            } ]
        }
    };
}

type EngineFailureResult = Readonly<Result<unknown, unknown>>;

function assertEngineFailure(result: EngineFailureResult): void {
    if (result.isOk) {
        assert.fail('Expected an engine compatibility check failure');
    }
    assert.deepStrictEqual(result.error, {
        type: 'checks',
        issues: [
            'Package "engine-example" failed Node engine compatibility via ' +
            'engine-example -> direct@1.0.0 -> leaf@2.0.0: engines.node ">=22" is not a subset of ">=24"'
        ]
    });
}

type ResolvedEngineResult = Readonly<Awaited<ReturnType<typeof resolveAndLinkAll>>['result']>;

function assertDeadDependencyRemoved(result: ResolvedEngineResult): void {
    if (!result.isOk) {
        assert.fail(JSON.stringify(result.error));
    }
    assert.deepStrictEqual(
        result.value.map(function (resolved) {
            return Array.from(resolved.analyzedBundle.externalDependencies.keys());
        }),
        [ [] ]
    );
}

suite('Node engine compatibility in the package pipeline', function () {
    test('fails resolution and publication on an incompatible required transitive dependency', async function () {
        const fixture = await createEngineFixture('export { value } from "direct";\n');
        try {
            const resolved = await resolveAndLinkAll(fixture.configuration);
            assertEngineFailure(resolved.result);
            const published = await buildAndPublishAll({
                ...fixture.configuration,
                registrySettings: {
                    registryAddress: 'http://127.0.0.1:1',
                    authentication: { type: 'bearer-token', token: 'unused-test-token' }
                }
            }, { dryRun: false, stage: false });
            assertEngineFailure(published.result);
        } finally {
            await rm(fixture.folder, { recursive: true, force: true });
        }
    });

    test('pack reports the same check failure before writing its output', async function () {
        const fixture = await createEngineFixture('export { value } from "direct";\n');
        const outputPath = path.join(fixture.folder, 'output');
        try {
            const packed = await packPackage(fixture.configuration, {
                packageName: 'engine-example',
                format: 'folder',
                outputPath,
                version: '1.0.0',
                vendorDependencies: false
            });
            assertEngineFailure(packed.result);
            await assert.rejects(async function () {
                await access(outputPath);
            }, { code: 'ENOENT' });
        } finally {
            await rm(fixture.folder, { recursive: true, force: true });
        }
    });

    test('ignores an incompatible tree after DCE removes its only import', async function () {
        const fixture = await createEngineFixture(
            'function removed() { return import("direct"); }\nexport const kept = 1;\n'
        );
        try {
            const { result } = await resolveAndLinkAll(fixture.configuration);
            assertDeadDependencyRemoved(result);
        } finally {
            await rm(fixture.folder, { recursive: true, force: true });
        }
    });

    test('uses package engine overrides instead of the common engine range', async function () {
        const fixture = await createEngineFixture('export { value } from "direct";\n');
        try {
            const { result } = await resolveAndLinkAll({
                ...fixture.configuration,
                packages: fixture.configuration.packages.map(function (packageConfiguration) {
                    return {
                        ...packageConfiguration,
                        additionalPackageManifestAttributes: { engines: { node: '>=24' } }
                    };
                })
            });
            assert.strictEqual(result.isOk, true);
        } finally {
            await rm(fixture.folder, { recursive: true, force: true });
        }
    });
});
