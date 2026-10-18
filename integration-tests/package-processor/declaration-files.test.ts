import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('declaration-files', function () {
    test('adds declaration files correctly to the bundle', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/javascript-and-declarations');
        const result = await packageProcessor.build({
            name: 'the-package-name',
            version: '42.0.0',
            sourcesFolder: path.join(fixture, 'source'),
            roots: {
                main: {
                    javaScript: path.join(fixture, 'source/entry.js'),
                    declarationFile: path.join(fixture, 'source/entry.d.ts')
                }
            },
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
                    name: 'the-package-name',
                    sideEffects: false,
                    version: '42.0.0',
                    type: 'module'
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
                            content: "import { bar } from './bar.js';\nexport const foo = 'foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('bar', 'foo')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "export const bar = 'bar';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/bar.js'),
                            targetFilePath: 'bar.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('bar')
                    },
                    {
                        directDependencies: new Set([ path.join(fixture, 'source/foo.d.ts') ]),
                        fileDescription: {
                            content: "export declare const foo: import('./foo.js').Foo;\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/entry.d.ts'),
                            targetFilePath: 'entry.d.ts'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([ path.join(fixture, 'source/baz.d.ts') ]),
                        fileDescription: {
                            content: "import { Baz } from './baz.js';\nexport type Foo = string;\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.d.ts'),
                            targetFilePath: 'foo.d.ts'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('Baz', 'Foo')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: 'export type Baz = number;\n',
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/baz.d.ts'),
                            targetFilePath: 'baz.d.ts'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('Baz')
                    }
                ],
                dependencies: {},
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
                typesMainFile: {
                    content: "export declare const foo: import('./foo.js').Foo;\n",
                    isExecutable: false,
                    inputFilePath: path.join(fixture, 'source/entry.d.ts'),
                    targetFilePath: 'entry.d.ts'
                },
                version: '42.0.0'
            })
        );
    });
});
