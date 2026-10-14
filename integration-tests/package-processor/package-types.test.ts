import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('package-types', function () {
    test('includes all required local files and references correct node modules but ignores builtin modules', async function () {
        const fixture = path.join(
            process.cwd(),
            'integration-tests/fixtures/with-local-builtin-and-node-module-dependencies'
        );
        const result = await packageProcessor.build({
            name: 'the-package-name',
            version: '42.0.0',
            sourcesFolder: path.join(fixture, 'source'),
            roots: { main: { javaScript: path.join(fixture, 'source/entry.js') } },
            mainPackageManifest: await loadPackageManifest(fixture),
            includeSourceMapFiles: false,
            additionalFiles: [],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageManifestAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(
            result,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageManifest: {
                    dependencies: { 'example-module': '1.2.3' },
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
                        directDependencies: new Set([ path.join(fixture, 'source/foo.js') ]),
                        fileDescription: {
                            content: "import { foo } from './foo.js';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([ path.join(fixture, 'source/bar.js') ]),
                        fileDescription: {
                            content:
                                "import { bar } from './bar.js';\nimport path from 'node:path';\n\nexport const foo = 'foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('bar', 'path', 'foo')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "import { example } from 'example-module';\n\nexport const bar = 'bar';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/bar.js'),
                            targetFilePath: 'bar.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('example', 'bar')
                    }
                ],
                dependencies: {
                    'example-module': '1.2.3'
                },
                mainFile: {
                    content: "import { foo } from './foo.js';\n",
                    isExecutable: false,
                    inputFilePath: path.join(fixture, 'source/entry.js'),
                    targetFilePath: 'entry.js'
                },
                name: 'the-package-name',
                packageType: 'module',
                peerDependencies: {},
                sideEffectsField: false,
                typesMainFile: undefined,
                version: '42.0.0'
            })
        );
    });

    test('includes peer dependencies correctly', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/with-peer-dependencies');
        const result = await packageProcessor.build({
            name: 'the-package-name',
            version: '42.0.0',
            sourcesFolder: path.join(fixture, 'source'),
            roots: { main: { javaScript: path.join(fixture, 'source/entry.js') } },
            mainPackageManifest: await loadPackageManifest(fixture),
            includeSourceMapFiles: false,
            additionalFiles: [],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageManifestAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(
            result,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageManifest: {
                    peerDependencies: { 'example-module': '1.2.3' },
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
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "import { example } from 'example-module';\nexport const foo = example;\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('example', 'foo')
                    }
                ],
                dependencies: {},
                mainFile: {
                    content: "import { example } from 'example-module';\nexport const foo = example;\n",
                    isExecutable: false,
                    inputFilePath: path.join(fixture, 'source/entry.js'),
                    targetFilePath: 'entry.js'
                },
                name: 'the-package-name',
                packageType: 'module',
                peerDependencies: {
                    'example-module': '1.2.3'
                },
                sideEffectsField: false,
                typesMainFile: undefined,
                version: '42.0.0'
            })
        );
    });
});
