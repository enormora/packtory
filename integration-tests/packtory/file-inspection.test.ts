import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';
import { inspectPackageFiles } from '../../source/packages/packtory/packtory.entry-point.ts';
import type { PacktoryConfigurationWithoutRegistry } from '../../source/configuration/configuration.ts';

function additionalFilesConfiguration(enabled: boolean): PacktoryConfigurationWithoutRegistry {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/additional-files');
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixture, 'source'),
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' },
            deadCodeElimination: { enabled }
        },
        packages: [ {
            name: 'example',
            roots: { main: { javaScript: 'entry.js' } },
            additionalFiles: [ {
                inputFilePath: path.join(fixture, 'documentation/additional-information.txt'),
                targetFilePath: 'guide.txt'
            } ]
        } ]
    };
}

suite('file inspection', function () {
    for (const enabled of [ true, false ]) {
        test(`explains imports and additional files with elimination ${String(enabled)}`, async function () {
            const outcome = await inspectPackageFiles(additionalFilesConfiguration(enabled), 'example');
            assert.ok(outcome.result.isOk, 'expected file inspection');
            const inspection = outcome.result.value;
            assert.deepStrictEqual(
                inspection.files.map(function (file) {
                    return file.packagePath;
                }),
                [
                    './entry.js',
                    './greeting.js',
                    './guide.txt'
                ]
            );
            assert.deepStrictEqual(inspection.files[1]?.discovery, {
                type: 'discovered',
                chain: [
                    {
                        packagePath: './entry.js',
                        sourcePath: 'integration-tests/fixtures/additional-files/source/entry.js',
                        via: 'root'
                    },
                    {
                        packagePath: './greeting.js',
                        sourcePath: 'integration-tests/fixtures/additional-files/source/greeting.js',
                        via: 'import'
                    }
                ]
            });
            assert.deepStrictEqual(inspection.files[2], {
                packagePath: './guide.txt',
                sourcePath: 'integration-tests/fixtures/additional-files/documentation/additional-information.txt',
                kind: 'file',
                discovery: {
                    type: 'discovered',
                    chain: [ {
                        packagePath: './guide.txt',
                        sourcePath:
                            'integration-tests/fixtures/additional-files/documentation/additional-information.txt',
                        via: 'additional-file'
                    } ]
                }
            });
        });
    }

    test('keeps substituted sibling files out of the selected package discovery graph', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const outcome = await inspectPackageFiles({
            commonPackageSettings: {
                sourcesFolder: path.join(fixture, 'source'),
                mainPackageManifest: { type: 'module' },
                publishSettings: { access: 'public' },
                deadCodeElimination: { enabled: false },
                includeSourceMapFiles: true
            },
            packages: [
                { name: 'qux', roots: { main: { javaScript: 'qux.js', declarationFile: 'qux.d.ts' } } },
                {
                    name: 'example',
                    roots: { main: { javaScript: 'entry1.js', declarationFile: 'entry1.d.ts' } },
                    bundleDependencies: [ 'qux' ]
                }
            ]
        }, 'example');
        assert.ok(outcome.result.isOk, 'expected sibling inspection');
        const inspection = outcome.result.value;
        assert.deepStrictEqual(
            inspection.files.map(function (file) {
                return file.packagePath;
            }),
            [
                './baz.d.ts',
                './entry1.d.ts',
                './entry1.js',
                './entry1.js.map',
                './foo.d.ts'
            ]
        );
        const map = inspection.files.find(function (file) {
            return file.packagePath === './entry1.js.map';
        });
        assertDefined(map);
        assert.strictEqual(map.discovery.type, 'discovered');
        assert.deepStrictEqual(
            map.discovery.chain.map(function (step) {
                return step.via;
            }),
            [ 'root', 'source-map' ]
        );
    });
});
