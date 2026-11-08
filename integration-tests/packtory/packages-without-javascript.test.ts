import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert';
import { readFile, writeFile, readdir } from 'node:fs/promises';
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
    type PackageConfiguration
} from './publish-fixture-support.ts';

const packageName = '@example/settings';
const packageConfiguration: PackageConfiguration = {
    name: packageName,
    roots: { types: { declarationFile: 'index.d.ts' }, schema: { json: 'schema.json' } },
    packageInterface: { modules: [ { root: 'types', export: '.' }, { root: 'schema', export: './schema.json' } ] },
    additionalFiles: [ { inputFilePath: 'readme.md', targetFilePath: 'readme.md' } ]
};
const expectedExports = { '.': { types: './index.d.ts' }, './schema.json': './schema.json' };

async function assertTypeConsumer(consumer: string): Promise<void> {
    const input = path.join(consumer, 'index.mts');
    await writeFile(
        input,
        [
            `import type { Settings } from '${packageName}';`,
            'const valid: Settings = { strict: true };',
            "const invalid: Settings = { strict: 'wrong' };"
        ]
            .join('\n')
    );
    const program = ts.createProgram([ input ], {
        strict: true,
        noEmit: true,
        types: [],
        target: ts.ScriptTarget.ES2024,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext
    });
    assert.deepStrictEqual(
        ts.getPreEmitDiagnostics(program).map(function (diagnostic) {
            return diagnostic.code;
        }),
        [ 2322 ]
    );
}

suite('packages without JavaScript', function () {
    test('packs declaration-only and JSON exports and preserves transitive declarations', async function () {
        const consumer = await packFixture('without-javascript', packageConfiguration);
        const output = path.join(consumer, 'node_modules', packageName);
        assert.partialDeepStrictEqual(JSON.parse(await readFile(path.join(output, 'package.json'), 'utf8')), {
            exports: expectedExports
        });
        const files = await readdir(output);
        assert.deepStrictEqual(
            files.toSorted(function (left, right) {
                return left.localeCompare(right);
            }),
            [
                'index.d.ts',
                'package.json',
                'readme.md',
                'schema.json',
                'settings.d.ts'
            ]
        );
        await assertTypeConsumer(consumer);
    });

    test('derives implicit exports for declaration-only and JSON roots', async function () {
        for (
            const entry of [
                {
                    fixture: 'without-javascript',
                    configuration: { name: '@example/types', roots: { main: { declarationFile: 'index.d.ts' } } },
                    expected: { types: './index.d.ts' }
                },
                {
                    fixture: 'json-only',
                    configuration: { name: '@example/json', roots: { main: { json: 'tsconfig.json' } } },
                    expected: './tsconfig.json'
                }
            ] as const
        ) {
            const consumer = await packFixture(entry.fixture, entry.configuration);
            assert.partialDeepStrictEqual(
                JSON.parse(
                    await readFile(
                        path.join(consumer, 'node_modules', entry.configuration.name, 'package.json'),
                        'utf8'
                    )
                ),
                {
                    exports: { '.': entry.expected }
                }
            );
        }
    });

    test('exposes JSON roots through the package interface', async function () {
        const configuration: PackageConfiguration = {
            name: '@example/tsconfigs',
            roots: { main: { json: 'tsconfig.json' }, node: { json: 'presets/node.json' } },
            packageInterface: { modules: [ { root: 'main', export: '.' }, { root: 'node', export: './node' } ] }
        };
        const consumer = await packFixture('json-only', configuration);
        const requirePackage = createRequire(path.join(consumer, 'index.mjs'));
        assert.partialDeepStrictEqual(requirePackage(configuration.name), { compilerOptions: { strict: true } });
        assert.partialDeepStrictEqual(requirePackage(`${configuration.name}/node`), {
            compilerOptions: { module: 'NodeNext' }
        });
        assert.partialDeepStrictEqual(
            JSON.parse(await readFile(path.join(consumer, 'node_modules', configuration.name, 'package.json'), 'utf8')),
            {
                exports: { '.': './tsconfig.json', './node': './presets/node.json' }
            }
        );
    });

    test(
        'publishes declaration-only packages with JSON exports and skips unchanged artifacts',
        checkWithRegistry(async function (registryDetails) {
            const input = {
                fixturePath: getFixturePath('without-javascript'),
                registryDetails,
                packages: [ packageConfiguration ] as const,
                commonPackageSettings: { deadCodeElimination: { enabled: true } }
            };
            assertPublishSucceeded(await publishFixturePackages(input));
            const published = await fetchPublishedPackage(packageName, registryDetails);
            assert.partialDeepStrictEqual(published.manifest, { exports: expectedExports });
            assert.strictEqual(
                getPublishedFile(published, 'package/settings.d.ts').content,
                'export interface Settings {\n    strict: boolean;\n}\n'
            );
            assertPublishSucceeded(await publishFixturePackages(input));
            assert.deepStrictEqual(await fetchPublishedPackage(packageName, registryDetails), published);
        })
    );

    test(
        'links declaration-only sibling packages through their type exports',
        checkWithRegistry(async function (registryDetails) {
            assertPublishSucceeded(
                await publishFixturePackages({
                    fixturePath: getFixturePath('without-javascript'),
                    registryDetails,
                    packages: [ packageConfiguration, {
                        name: '@example/consumer-types',
                        roots: { main: { declarationFile: 'consumer.d.ts' } },
                        bundleDependencies: [ packageName ]
                    } ],
                    commonPackageSettings: { deadCodeElimination: { enabled: true } }
                })
            );
            const published = await fetchPublishedPackage('@example/consumer-types', registryDetails);
            assert.partialDeepStrictEqual(published.manifest, {
                exports: { '.': { types: './consumer.d.ts' } },
                dependencies: { [packageName]: '0.0.1' }
            });
            assert.match(
                getPublishedFile(published, 'package/consumer.d.ts').content,
                /from ['"]@example\/settings['"]/u
            );
            assert.deepStrictEqual(
                published
                    .files
                    .map(function (entry) {
                        return entry.filePath;
                    })
                    .toSorted(function (left, right) {
                        return left.localeCompare(right);
                    }),
                [ 'package/consumer.d.ts', 'package/package.json' ]
            );
        })
    );

    test(
        'links JSON sibling exports without embedding their source files',
        checkWithRegistry(async function (registryDetails) {
            const sharedName = '@example/shared-json';
            const consumerName = '@example/json-consumer';
            assertPublishSucceeded(
                await publishFixturePackages({
                    fixturePath: getFixturePath('json-export-consumer'),
                    registryDetails,
                    packages: [
                        { name: sharedName, roots: { main: { json: 'settings.json' } } },
                        {
                            name: consumerName,
                            roots: { main: { javaScript: 'index.js' } },
                            bundleDependencies: [ sharedName ]
                        }
                    ],
                    commonPackageSettings: { deadCodeElimination: { enabled: true } }
                })
            );
            const published = await fetchPublishedPackage(consumerName, registryDetails);
            assert.partialDeepStrictEqual(published.manifest, { dependencies: { [sharedName]: '0.0.1' } });
            assert.match(
                getPublishedFile(published, 'package/index.js').content,
                /from ['"]@example\/shared-json['"] with/u
            );
            assert.deepStrictEqual(
                published
                    .files
                    .map(function (file) {
                        return file.filePath;
                    })
                    .toSorted(function (left, right) {
                        return left.localeCompare(right);
                    }),
                [
                    'package/index.js',
                    'package/package.json'
                ]
            );
        })
    );
});
