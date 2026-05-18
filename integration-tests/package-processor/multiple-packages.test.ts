import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis, emptyAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('multiple-packages', function () {
    test('bundles and substitutes multiple packages correctly', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const firstBundle = await packageProcessor.build({
            name: 'first',
            version: '1.2.3',
            sourcesFolder: path.join(fixture, 'src'),
            roots: {
                main: {
                    js: path.join(fixture, 'src/entry1.js'),
                    declarationFile: path.join(fixture, 'src/entry1.d.ts')
                }
            },
            mainPackageJson: await loadPackageJson(fixture),
            includeSourceMapFiles: true,
            additionalFiles: [],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });
        const secondBundle = await packageProcessor.build({
            name: 'second',
            version: '2.3.4',
            sourcesFolder: path.join(fixture, 'src'),
            roots: {
                main: {
                    js: path.join(fixture, 'src/entry2.js'),
                    declarationFile: path.join(fixture, 'src/entry2.d.ts')
                }
            },
            mainPackageJson: await loadPackageJson(fixture),
            includeSourceMapFiles: true,
            bundleDependencies: [firstBundle],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {},
            additionalFiles: [],
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });
        const thirdBundle = await packageProcessor.build({
            name: 'third',
            version: '3.4.5',
            sourcesFolder: path.join(fixture, 'src'),
            roots: {
                main: {
                    js: path.join(fixture, 'src/entry3.js'),
                    declarationFile: path.join(fixture, 'src/entry3.d.ts')
                }
            },
            mainPackageJson: await loadPackageJson(fixture),
            includeSourceMapFiles: true,
            bundleDependencies: [firstBundle],
            bundlePeerDependencies: [secondBundle],
            additionalPackageJsonAttributes: {},
            additionalFiles: [],
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(
            firstBundle,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageJson: {
                    name: 'first',
                    sideEffects: false,
                    version: '1.2.3',
                    type: 'module'
                },
                manifestFile: {
                    isExecutable: false,
                    content: '',
                    filePath: 'package.json'
                },
                contents: [
                    {
                        directDependencies: new Set([
                            path.join(fixture, 'src/qux.js'),
                            path.join(fixture, 'src/entry1.js.map')
                        ]),
                        fileDescription: {
                            content: "import { qux } from './qux.js';\n//# sourceMappingURL=entry1.js.map\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry1.js'),
                            targetFilePath: 'entry1.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('qux')
                    },
                    {
                        directDependencies: new Set([path.join(fixture, 'src/qux.js.map')]),
                        fileDescription: {
                            content: "export const qux = 'qux';\n//# sourceMappingURL=qux.js.map\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/qux.js'),
                            targetFilePath: 'qux.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('qux')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content:
                                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry1.js.map'),
                            targetFilePath: 'entry1.js.map'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content:
                                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/qux.js.map'),
                            targetFilePath: 'qux.js.map'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    },
                    {
                        directDependencies: new Set([path.join(fixture, 'src/foo.d.ts')]),
                        fileDescription: {
                            content: "export declare const foo: import('./foo.js').Foo;\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry1.d.ts'),
                            targetFilePath: 'entry1.d.ts'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([path.join(fixture, 'src/baz.d.ts')]),
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
                    content: "import { qux } from './qux.js';\n//# sourceMappingURL=entry1.js.map\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry1.js'),
                    targetFilePath: 'entry1.js'
                },
                name: 'first',
                packageType: 'module',
                peerDependencies: {},
                sideEffectsField: false,
                typesMainFile: {
                    content: "export declare const foo: import('./foo.js').Foo;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry1.d.ts'),
                    targetFilePath: 'entry1.d.ts'
                },
                version: '1.2.3'
            })
        );
        assert.deepStrictEqual(
            secondBundle,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageJson: {
                    dependencies: { first: '1.2.3' },
                    name: 'second',
                    sideEffects: false,
                    version: '2.3.4',
                    type: 'module'
                },
                manifestFile: {
                    isExecutable: false,
                    content: '',
                    filePath: 'package.json'
                },
                contents: [
                    {
                        directDependencies: new Set([
                            path.join(fixture, 'src/bar.js'),
                            path.join(fixture, 'src/entry2.js.map')
                        ]),
                        fileDescription: {
                            content: "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry2.js'),
                            targetFilePath: 'entry2.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('bar')
                    },
                    {
                        directDependencies: new Set([path.join(fixture, 'src/bar.js.map')]),
                        fileDescription: {
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/bar.js'),
                            targetFilePath: 'bar.js',
                            content:
                                "import { qux } from 'first/qux.js';\nexport const bar = 'bar';\n//# sourceMappingURL=bar.js.map\n"
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: true,
                        analysis: bindingAnalysis('qux', 'bar')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content:
                                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry2.js.map'),
                            targetFilePath: 'entry2.js.map'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content:
                                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/bar.js.map'),
                            targetFilePath: 'bar.js.map'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry2.d.ts'),
                            targetFilePath: 'entry2.d.ts',
                            content: "export declare const foo: import('first/foo.d.ts').Foo;\n"
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: true,
                        analysis: bindingAnalysis('foo')
                    }
                ],
                dependencies: { first: '1.2.3' },
                mainFile: {
                    content: "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry2.js'),
                    targetFilePath: 'entry2.js'
                },
                name: 'second',
                packageType: 'module',
                peerDependencies: {},
                sideEffectsField: false,
                typesMainFile: {
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry2.d.ts'),
                    targetFilePath: 'entry2.d.ts',
                    content: "export declare const foo: import('./foo.js').Foo;\n"
                },
                version: '2.3.4'
            })
        );
        assert.deepStrictEqual(
            thirdBundle,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageJson: {
                    dependencies: { first: '1.2.3' },
                    peerDependencies: { second: '2.3.4' },
                    name: 'third',
                    sideEffects: false,
                    version: '3.4.5',
                    type: 'module'
                },
                manifestFile: {
                    isExecutable: false,
                    content: '',
                    filePath: 'package.json'
                },
                contents: [
                    {
                        directDependencies: new Set([
                            path.join(fixture, 'src/foo.js'),
                            path.join(fixture, 'src/entry3.js.map')
                        ]),
                        fileDescription: {
                            content: "import { foo } from './foo.js';\n//# sourceMappingURL=entry3.js.map\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry3.js'),
                            targetFilePath: 'entry3.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([path.join(fixture, 'src/foo.js.map')]),
                        fileDescription: {
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/foo.js'),
                            targetFilePath: 'foo.js',
                            content:
                                "import { bar } from 'second/bar.js';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n"
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: true,
                        analysis: bindingAnalysis('bar', 'foo')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content:
                                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry3.js.map'),
                            targetFilePath: 'entry3.js.map'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content:
                                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/foo.js.map'),
                            targetFilePath: 'foo.js.map'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry3.d.ts'),
                            targetFilePath: 'entry3.d.ts',
                            content: "export declare const foo: import('first/foo.d.ts').Foo;\n"
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: true,
                        analysis: bindingAnalysis('foo')
                    }
                ],
                dependencies: { first: '1.2.3' },
                mainFile: {
                    content: "import { foo } from './foo.js';\n//# sourceMappingURL=entry3.js.map\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry3.js'),
                    targetFilePath: 'entry3.js'
                },
                name: 'third',
                packageType: 'module',
                peerDependencies: { second: '2.3.4' },
                sideEffectsField: false,
                typesMainFile: {
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry3.d.ts'),
                    targetFilePath: 'entry3.d.ts',
                    content: "export declare const foo: import('./foo.js').Foo;\n"
                },
                version: '3.4.5'
            })
        );
    });
});
