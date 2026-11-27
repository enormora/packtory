import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { inspectCanaryPackages } from '../../../source/build-support/canaries/canary-package-inspection.entry-point.ts';

import {
    createNodeImportProbe,
    inspectPackageApplicationProgrammingInterfaces
} from '../../../source/build-support/canaries/package-application-programming-interface-inspection.ts';
import {
    fileManager,
    withTemporaryNodeModules,
    writePackage,
    writeScopedPackage
} from '../../../source/test-libraries/canary-package-fixtures.ts';
import { assertPresent } from '../../../source/test-libraries/deep-subset-assertion.ts';

import { createNativeCanaryRuntime, executeNativeCanaryProcess, nativeNodePath } from './native-runtime.ts';

function packageManifest(): Readonly<Record<string, unknown>> {
    return {
        bin: {
            sample: './cli.js'
        },
        exports: {
            '.': {
                import: './index.js',
                types: './index.d.ts'
            },
            './feature': {
                import: './feature.js',
                types: './feature.d.ts'
            },
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
    await writeScopedPackage(nodeModulesFolder, '@scope/addon', {
        type: 'module',
        exports: './index.js'
    }, {
        'index.d.ts': 'export type Addon = string;\n',
        'index.js': 'export const addon = true;\n'
    });
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
const runNodeImportProbe = createNodeImportProbe(10_000, executeNativeCanaryProcess, nativeNodePath);

function assertSamplePackage(
    samplePackage: Awaited<ReturnType<typeof inspectPackageApplicationProgrammingInterfaces>>['packages'][number]
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

suite('package-api-inspection', function () {
    test('inspects runtime exports and declarations from installed packages', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writeInspectablePackages(nodeModulesFolder);
            const result = await inspectPackageApplicationProgrammingInterfaces({
                createProject: createNativeCanaryRuntime().createProject,
                fileManager,
                nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(path.dirname(nodeModulesFolder), 'runtime-types'),
                runImportProbe: runNodeImportProbe
            });
            assertInspectablePackageNames(result);
            assert.deepStrictEqual(result.packages[0]?.publicExports[0]?.runtimeExportNames, [ 'addon' ]);
            assertSamplePackage(assertPresent(result.packages[1]));
        });
    });

    test('retains package order, declarations and import failures across inspection workers', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writeInspectablePackages(nodeModulesFolder);
            await writePackage(nodeModulesFolder, 'sample-with-broken-import', {
                exports: './index.js',
                type: 'module'
            }, {
                'index.d.ts': 'export const value: MissingType;',
                'index.js': 'throw new Error("cannot import sample-with-broken-import");'
            });
            const output = {
                nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(path.dirname(nodeModulesFolder), 'runtime-types')
            };
            const serial = await inspectCanaryPackages(output, 2);
            const parallel = await inspectCanaryPackages(output, 4);
            assert.deepStrictEqual(parallel, serial);
            assertSamplePackage(assertPresent(parallel.packages[1]));
            const brokenPackage = assertPresent(parallel.packages[2]);
            assert.match(
                brokenPackage.publicExports[0]?.runtimeImportError ?? '',
                /cannot import sample-with-broken-import/u
            );
            assert.match(brokenPackage.typeDiagnostics.join('\n'), /Cannot find name 'MissingType'/u);
        });
    });
});
