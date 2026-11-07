import path from 'node:path';
import assert from 'node:assert';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import { suite, test } from 'mocha';
import ts from 'typescript';
import { checkWithRegistry } from '../registry.ts';
import { packFixture } from './pack-fixture.ts';
import {
    assertPublishSucceeded,
    fetchPublishedPackage,
    getFixturePath,
    getPublishedFile,
    publishFixturePackages,
    type PackageConfiguration,
    type PublishFixturePackagesInput
} from './publish-fixture-support.ts';

const packageName = '@example/tsconfigs';
const fixturePath = getFixturePath('json-only');
const additionalFiles = [
    { inputFilePath: 'tsconfig.json', targetFilePath: 'tsconfig.json' },
    { inputFilePath: 'presets/node.json', targetFilePath: 'presets/node.json' },
    { inputFilePath: 'readme.md', targetFilePath: 'readme.md' }
];
const packageConfiguration: PackageConfiguration = { name: packageName, roots: {}, additionalFiles };

async function assertPackedFiles(outputPath: string): Promise<void> {
    const manifest: unknown = JSON.parse(await readFile(path.join(outputPath, 'package.json'), 'utf8'));
    assert.deepStrictEqual(manifest, {
        name: packageName,
        version: '1.2.3',
        type: 'module',
        sideEffects: false,
        exports: {
            './tsconfig.json': './tsconfig.json',
            './presets/node.json': './presets/node.json',
            './readme.md': './readme.md'
        }
    });
    for (const file of additionalFiles) {
        assert.strictEqual(
            await readFile(path.join(outputPath, file.targetFilePath), 'utf8'),
            await readFile(path.join(fixturePath, 'source', file.inputFilePath), 'utf8')
        );
    }
}

async function assertConsumerConfiguration(consumerFolder: string): Promise<void> {
    await writeFile(path.join(consumerFolder, 'index.ts'), 'export {};\n');
    const consumerConfig = path.join(consumerFolder, 'tsconfig.json');
    await writeFile(
        consumerConfig,
        JSON.stringify({ extends: `${packageName}/presets/node.json`, files: [ 'index.ts' ] })
    );
    const parsed = ts.getParsedCommandLineOfConfigFile(consumerConfig, {}, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic(diagnostic) {
            assert.fail(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        }
    });
    assert.notStrictEqual(parsed, undefined);
    assert.partialDeepStrictEqual(parsed, {
        errors: [],
        options: { strict: true, module: ts.ModuleKind.NodeNext, target: ts.ScriptTarget.ES2024 }
    });
}

async function assertUnchangedPublication(input: PublishFixturePackagesInput): Promise<void> {
    assertPublishSucceeded(await publishFixturePackages(input));
    const first = await fetchPublishedPackage(packageName, input.registryDetails);
    assert.strictEqual(first.version, '0.0.1');
    assert.strictEqual(
        getPublishedFile(first, 'package/presets/node.json').content,
        await readFile(path.join(fixturePath, 'source/presets/node.json'), 'utf8')
    );
    assertPublishSucceeded(await publishFixturePackages(input));
    assert.deepStrictEqual(await fetchPublishedPackage(packageName, input.registryDetails), first);
}

suite('json-only packages', function () {
    test('packs JSON files that TypeScript consumers can extend through package subpaths', async function () {
        const consumerFolder = await packFixture('json-only', packageConfiguration);
        const outputPath = path.join(consumerFolder, 'node_modules/@example/tsconfigs');
        await assertPackedFiles(outputPath);
        await assertConsumerConfiguration(consumerFolder);
    });

    test(
        'publishes unchanged JSON packages once and bumps the version when JSON content changes',
        checkWithRegistry(async function (registryDetails) {
            const publishInput = {
                fixturePath,
                registryDetails,
                packages: [ packageConfiguration ] as const,
                commonPackageSettings: { deadCodeElimination: { enabled: true } }
            };
            await assertUnchangedPublication(publishInput);
            const changedFolder = await mkdtemp(path.join(temporaryDirectory(), 'packtory-json-changed-'));
            const changedJson = path.join(changedFolder, 'tsconfig.json');
            await writeFile(changedJson, '{"compilerOptions":{"strict":false}}\n');
            assertPublishSucceeded(
                await publishFixturePackages({
                    ...publishInput,
                    packages: [ {
                        ...packageConfiguration,
                        additionalFiles: [
                            { inputFilePath: changedJson, targetFilePath: 'tsconfig.json' },
                            ...additionalFiles.slice(1)
                        ]
                    } ]
                })
            );
            const changed = await fetchPublishedPackage(packageName, registryDetails);
            assert.strictEqual(changed.version, '0.0.2');
            assert.strictEqual(
                getPublishedFile(changed, 'package/tsconfig.json').content,
                '{"compilerOptions":{"strict":false}}\n'
            );
        })
    );
});
