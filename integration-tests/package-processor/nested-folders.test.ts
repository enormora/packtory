import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('nested-folders', function () {
    test('resolves files in a nested folder structure correctly', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/nested-folders');
        const result = await packageProcessor.build({
            name: 'the-package-name',
            version: '42.0.0',
            sourcesFolder: path.join(fixture, 'src'),
            roots: { main: { js: path.join(fixture, 'src/entry.js') } },
            mainPackageJson: await loadPackageJson(fixture),
            includeSourceMapFiles: false,
            additionalFiles: [],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(
            result,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageJson: {
                    name: 'the-package-name',
                    sideEffects: false,
                    type: 'module',
                    version: '42.0.0'
                },
                manifestFile: {
                    isExecutable: false,
                    content: '',
                    filePath: 'package.json'
                },
                contents: [
                    {
                        directDependencies: new Set([path.join(fixture, 'src/nested/foo.js')]),
                        fileDescription: {
                            content: "import { foo } from './nested/foo.js';\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([path.join(fixture, 'src/nested/deep/bar.js')]),
                        fileDescription: {
                            content: "import { bar } from './deep/bar.js';\n\nexport const foo = 'foo';\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/nested/foo.js'),
                            targetFilePath: 'nested/foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('bar', 'foo')
                    },
                    {
                        directDependencies: new Set([path.join(fixture, 'src/nested/deep/folder/baz.js')]),
                        fileDescription: {
                            content: "import { baz } from './folder/baz.js';\n\nexport const bar = 'bar';\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/nested/deep/bar.js'),
                            targetFilePath: 'nested/deep/bar.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('baz', 'bar')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "export const baz = 'baz';\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/nested/deep/folder/baz.js'),
                            targetFilePath: 'nested/deep/folder/baz.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('baz')
                    }
                ],
                mainFile: {
                    content: "import { foo } from './nested/foo.js';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
                    targetFilePath: 'entry.js'
                },
                dependencies: {},
                packageType: 'module',
                peerDependencies: {},
                name: 'the-package-name',
                sideEffectsField: false,
                typesMainFile: undefined,
                version: '42.0.0'
            })
        );
    });
});
