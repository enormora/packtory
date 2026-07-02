import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('declaration-files', function () {
    test('adds declaration files correctly to the bundle', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-and-d-ts');
        const result = await packageProcessor.build({
            name: 'the-package-name',
            version: '42.0.0',
            sourcesFolder: path.join(fixture, 'src'),
            roots: {
                main: {
                    js: path.join(fixture, 'src/entry.js'),
                    declarationFile: path.join(fixture, 'src/entry.d.ts')
                }
            },
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
                        directDependencies: new Set([ path.join(fixture, 'src/foo.js') ]),
                        fileDescription: {
                            content: "import { foo } from './foo.js';\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([ path.join(fixture, 'src/bar.js') ]),
                        fileDescription: {
                            content: "import { bar } from './bar.js';\nexport const foo = 'foo';\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/foo.js'),
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
                            sourceFilePath: path.join(fixture, 'src/bar.js'),
                            targetFilePath: 'bar.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('bar')
                    },
                    {
                        directDependencies: new Set([ path.join(fixture, 'src/foo.d.ts') ]),
                        fileDescription: {
                            content: "export declare const foo: import('./foo.js').Foo;\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry.d.ts'),
                            targetFilePath: 'entry.d.ts'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([ path.join(fixture, 'src/baz.d.ts') ]),
                        fileDescription: {
                            content: "import { Baz } from './baz.js';\nexport type Foo = string;\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/foo.d.ts'),
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
                            sourceFilePath: path.join(fixture, 'src/baz.d.ts'),
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
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
                    targetFilePath: 'entry.js'
                },
                name: 'the-package-name',
                packageType: 'module',
                peerDependencies: {},
                sideEffectsField: false,
                typesMainFile: {
                    content: "export declare const foo: import('./foo.js').Foo;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.d.ts'),
                    targetFilePath: 'entry.d.ts'
                },
                version: '42.0.0'
            })
        );
    });
});
