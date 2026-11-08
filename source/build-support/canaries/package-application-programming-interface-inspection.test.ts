import assert from 'node:assert';
import { setImmediate as nextTurn } from 'node:timers/promises';
import path from 'node:path';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    fileManager,
    withTemporaryNodeModules,
    writePackage,
    writeScopedPackage,
    assertPresent
} from '../../test-libraries/canary-package-fixtures.ts';
import {
    inspectPackageApplicationProgrammingInterfaces,
    createNodeImportProbe
} from './package-application-programming-interface-inspection.ts';

type ImportProbeCall = {
    readonly cwd: string;
    readonly specifier: string;
};

function packageManifest(): Readonly<Record<string, unknown>> {
    return {
        bin: { sample: './cli.js' },
        exports: {
            '.': { import: './index.js', types: './index.d.ts' },
            './feature': { import: './feature.js', types: './feature.d.ts' },
            './package.json': './package.json'
        },
        type: 'module'
    };
}

function packageFiles(): Readonly<Record<string, string>> {
    return {
        'cli.js': '#!/usr/bin/env node\n',
        'feature.d.ts': 'export interface FeatureOptions {}\nexport const feature: number;\n',
        'feature.js': 'export const feature = 1;\n',
        'index.d.ts': [
            'export class Widget {}',
            'export function createWidget(): Widget;',
            'export interface WidgetOptions {}',
            'export namespace widgetNamespace { export const value: string; }',
            ''
        ]
            .join('\n'),
        'index.js': 'export class Widget {}\nexport function createWidget() { return new Widget(); }\n'
    };
}

async function writeInspectablePackages(nodeModulesFolder: string): Promise<void> {
    await writePackage(nodeModulesFolder, 'sample', packageManifest(), packageFiles());
    await writeScopedPackage(nodeModulesFolder, '@scope/addon', { exports: './index.js' }, {
        'index.d.ts': 'export type Addon = string;\n',
        'index.js': 'export const addon = true;\n'
    });
}

function runtimeNamesFor(specifier: string): readonly string[] {
    return specifier === 'sample'
        ? [ 'Widget', 'createWidget' ]
        : [ 'feature' ];
}

function assertInspectablePackageNames(
    result: Awaited<ReturnType<typeof inspectPackageApplicationProgrammingInterfaces>>
): void {
    assert.deepStrictEqual(
        result.packages.map(function (entry) {
            return entry.name;
        }),
        [ '@scope/addon', 'sample' ]
    );
}

const runNodeImportProbe = createNodeImportProbe(10_000);

suite('package-api-inspection', function () {
    function assertSamplePackage(
        samplePackage: Awaited<
            ReturnType<typeof inspectPackageApplicationProgrammingInterfaces>
        >['packages'][number]
    ): void {
        const rootExport = assertPresent(samplePackage.publicExports[0]);
        const featureExport = assertPresent(samplePackage.publicExports[1]);
        assert.deepStrictEqual(samplePackage.executableTargets, [ 'sample -> cli.js' ]);
        assert.partialDeepStrictEqual(rootExport, {
            runtimeExportNames: [ 'Widget', 'createWidget' ],
            typeExportNames: {
                namespace: [ 'widgetNamespace' ],
                type: [ 'Widget', 'WidgetOptions' ],
                value: [ 'createWidget', 'Widget', 'widgetNamespace' ]
            }
        });
        assert.partialDeepStrictEqual(featureExport, {
            runtimeExportNames: [ 'feature' ],
            typeExportNames: {
                namespace: [],
                type: [ 'FeatureOptions' ],
                value: [ 'feature' ]
            }
        });
    }

    test('inspectPackageApplicationProgrammingInterfaces reports runtime, type, and bin surfaces for generated packages', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            const calls: ImportProbeCall[] = [];
            const completedSpecifiers = new Set<string>();
            await writeInspectablePackages(nodeModulesFolder);

            const result = await inspectPackageApplicationProgrammingInterfaces({
                fileManager,
                nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(path.dirname(nodeModulesFolder), 'runtime-types'),
                async runImportProbe(cwd, specifier) {
                    calls.push({ cwd, specifier });
                    if (specifier.startsWith('sample')) {
                        assert.strictEqual(completedSpecifiers.has('@scope/addon'), true);
                    }
                    await nextTurn();
                    completedSpecifiers.add(specifier);
                    return runtimeNamesFor(specifier);
                }
            });

            assert.deepStrictEqual(
                calls.toSorted(function (left, right) {
                    return left.specifier.localeCompare(right.specifier);
                }),
                [
                    { cwd: nodeModulesFolder, specifier: '@scope/addon' },
                    { cwd: nodeModulesFolder, specifier: 'sample' },
                    { cwd: nodeModulesFolder, specifier: 'sample/feature' }
                ]
            );
            assertInspectablePackageNames(result);
            const sample = assertPresent(result.packages[1]);
            assertSamplePackage(sample);
        });
    });

    test('inspectPackageApplicationProgrammingInterfaces records runtime import failures and TypeScript diagnostics', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'broken', { exports: './index.js', type: 'module' }, {
                'index.d.ts': 'export interface Broken { value: MissingType; }\n',
                'index.js': 'export const broken = true;\n'
            });

            const result = await inspectPackageApplicationProgrammingInterfaces({
                fileManager,
                nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(path.dirname(nodeModulesFolder), 'runtime-types'),
                async runImportProbe() {
                    throw new Error('import failed');
                }
            });

            const inspectedPackage = assertPresent(result.packages[0]);
            assert.strictEqual(
                assertPresent(inspectedPackage.publicExports[0]).runtimeImportError,
                'import failed'
            );
            assert.match(inspectedPackage.typeDiagnostics.join('\n'), /TS2304: Cannot find name 'MissingType'/u);
        });
    });

    test('inspects import-only declarations from an ESM consumer with Node ambient types', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, '@types/node', {}, {
                'index.d.ts': 'declare class Buffer { readonly byteLength: number; }\n'
            });
            await writePackage(nodeModulesFolder, 'typed', {
                exports: { '.': { types: './index.d.ts', import: './index.js' } },
                type: 'module'
            }, {
                'index.d.ts': 'export function read(): Buffer;\n',
                'index.js': 'export function read() { return Buffer.from("hello"); }\n'
            });
            const result = await inspectPackageApplicationProgrammingInterfaces({
                fileManager,
                nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(nodeModulesFolder, '@types'),
                runImportProbe: runNodeImportProbe
            });
            const typed = assertPresent(result.packages.find(function (entry) {
                return entry.name === 'typed';
            }));
            assert.deepStrictEqual(typed.typeDiagnostics, []);
            assert.deepStrictEqual(assertPresent(typed.publicExports[0]).runtimeExportNames, [ 'read' ]);
        });
    });

    test('checks JavaScript-only exports without inventing a declaration requirement', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'javascript', {
                exports: { '.': { import: './index.js' } },
                type: 'module'
            }, { 'index.js': 'export const configuration = [];\n' });
            const result = await inspectPackageApplicationProgrammingInterfaces({
                fileManager,
                nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(path.dirname(nodeModulesFolder), 'runtime-types'),
                runImportProbe: runNodeImportProbe
            });
            const inspected = assertPresent(result.packages[0]);
            assert.deepStrictEqual(inspected.typeDiagnostics, []);
            assert.deepStrictEqual(assertPresent(inspected.publicExports[0]).runtimeExportNames, [
                'configuration'
            ]);
        });
    });

    test('reports browser-only declarations as unavailable to Node consumers', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'browser-types', {
                exports: { '.': { types: './index.d.ts', import: './index.js' } },
                type: 'module'
            }, {
                'index.d.ts': 'export interface BrowserElement { element: HTMLElement; }\n',
                'index.js': 'export {};\n'
            });
            const result = await inspectPackageApplicationProgrammingInterfaces({
                fileManager,
                nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(path.dirname(nodeModulesFolder), 'runtime-types'),
                runImportProbe: runNodeImportProbe
            });
            assert.match(
                assertPresent(result.packages[0]).typeDiagnostics.join('\n'),
                /TS2304: Cannot find name 'HTMLElement'/u
            );
        });
    });

    test('inspectPackageApplicationProgrammingInterfaces rejects unreadable generated package folders', async function () {
        const fakeFileManager = createFakeFileManager({
            simulatedCheckReadabilityResponses: [ { value: { isReadable: false } } ]
        });

        await assert.rejects(
            async function () {
                await inspectPackageApplicationProgrammingInterfaces({
                    fileManager: fakeFileManager,
                    nodeModulesFolder: '/missing',
                    nodeTypeDefinitionsFolder: '/missing-types',
                    async runImportProbe() {
                        return [];
                    }
                });
            },
            /Generated package folder "\/missing" is not readable/u
        );
    });

    test('runNodeImportProbe imports a package and reports sorted runtime exports', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'runtime', { exports: './index.js', type: 'module' }, {
                'index.js': 'export const zebra = true;\nexport const apple = true;\n'
            });

            assert.deepStrictEqual(await runNodeImportProbe(nodeModulesFolder, 'runtime'), [ 'apple', 'zebra' ]);
        });
    });

    test('runNodeImportProbe reports failed import stack traces', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'runtime', { exports: './index.js', type: 'module' }, {
                'index.js': 'throw new Error("load exploded");\n'
            });

            await assert.rejects(
                async function () {
                    await runNodeImportProbe(nodeModulesFolder, 'runtime');
                },
                /Error: load exploded\n\s+at/u
            );
        });
    });

    test('runNodeImportProbe rejects when an import exits without output', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'runtime', { exports: './index.js', type: 'module' }, {
                'index.js': 'process.exit(0);\n'
            });

            await assert.rejects(
                async function () {
                    await runNodeImportProbe(nodeModulesFolder, 'runtime');
                },
                /Import probe completed without JSON output/u
            );
        });
    });
});
