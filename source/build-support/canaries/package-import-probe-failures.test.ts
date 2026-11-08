import assert from 'node:assert';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { suite, test } from 'mocha';
import {
    assertPresent,
    fileManager,
    withTemporaryNodeModules,
    writePackage
} from '../../test-libraries/canary-package-fixtures.ts';
import {
    createNodeImportProbe,
    inspectPackageApplicationProgrammingInterfaces
} from './package-application-programming-interface-inspection.ts';

const runNodeImportProbe = createNodeImportProbe(10_000);

suite('package-import-probe-failures', function () {
    for (
        const [ content, expected ] of [
            [ 'console.log("{}"); process.exit(0);', /Import probe did not print a string array/u ],
            [ 'console.log("[1]"); process.exit(0);', /Import probe did not print a string array/u ],
            [ 'console.log("invalid"); process.exit(0);', /Unexpected token/u ],
            [ 'console.log("probe failed"); process.exit(2);', /probe failed/u ],
            [ 'process.exit(2);', /Command failed/u ]
        ] as const
    ) {
        test(`rejects invalid import probe results: ${content}`, async function () {
            await withTemporaryNodeModules(async function (nodeModulesFolder) {
                await writePackage(nodeModulesFolder, 'runtime', { exports: './index.js', type: 'module' }, {
                    'index.js': content
                });
                await assert.rejects(runNodeImportProbe(nodeModulesFolder, 'runtime'), expected);
            });
        });
    }

    test('terminates an import probe that hangs without output', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'runtime', { exports: './index.js', type: 'module' }, {
                'index.js': 'await new Promise(function () { setInterval(function () {}, 1000); });'
            });
            const probe = createNodeImportProbe(100);
            await assert.rejects(
                probe(nodeModulesFolder, 'runtime'),
                /Import probe timed out after 100 ms without output/u
            );
        });
    });

    test('ignores loose files in node_modules and rejects malformed manifests', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writeFile(path.join(nodeModulesFolder, 'loose.txt'), 'ignored');
            await mkdir(path.join(nodeModulesFolder, 'broken'));
            await writeFile(path.join(nodeModulesFolder, 'broken/package.json'), '{}');
            await assert.rejects(
                inspectPackageApplicationProgrammingInterfaces({
                    fileManager,
                    nodeModulesFolder,
                    nodeTypeDefinitionsFolder: '',
                    runImportProbe: runNodeImportProbe
                }),
                /is missing a string name/u
            );
        });
    });

    test('reports unresolved declared exports without inventing type names', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'missing', {
                exports: { '.': { types: './missing.d.ts', import: './index.js' } }
            }, {});
            const result = await inspectPackageApplicationProgrammingInterfaces({
                fileManager,
                nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(path.dirname(nodeModulesFolder), 'runtime-types'),
                async runImportProbe() {
                    return [];
                }
            });
            assert.deepStrictEqual(assertPresent(result.packages[0]).publicExports[0]?.typeExportNames, {
                namespace: [],
                type: [],
                value: []
            });
            assert.match(
                assertPresent(result.packages[0]).typeDiagnostics.join('\n'),
                /Cannot find module 'missing'/u
            );
        });
    });
});
