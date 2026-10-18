import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('type-roots', function () {
    test('resolves node_modules dependencies correctly when depending on @types/* packages', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/type-roots-node-modules');
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
                    dependencies: {
                        foo: '21.0.0',
                        '@types/foo': '42.0.0'
                    },
                    name: 'the-package-name',
                    sideEffects: [ './foo.js' ],
                    version: '42.0.0',
                    type: 'module'
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
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "import { bar } from 'foo';\nexport const foo = bar('foo');\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: {
                            survivingBindings: new Set([ 'bar', 'foo' ]),
                            sideEffectStatements: [ { line: 2, kind: 'variable initializer' } ],
                            sideEffectImports: new Set<string>()
                        }
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
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "export type Bar = string;\nexport type { Foo } from 'foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.d.ts'),
                            targetFilePath: 'foo.d.ts'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('Bar')
                    }
                ],
                manifestFile: {
                    content: '',
                    isExecutable: false,
                    filePath: 'package.json'
                },
                dependencies: {
                    foo: '21.0.0',
                    '@types/foo': '42.0.0'
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
                sideEffectsField: [ './foo.js' ],
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
