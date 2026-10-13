import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis, emptyAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('module-types', function () {
    test('rejects packages whose mainPackageManifest.type is not "module"', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/javascript-cjs');

        try {
            await packageProcessor.build({
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
                allowMutableSpecifiers: []
            });
            assert.fail('Expected packageProcessor.build() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'mainPackageManifest.type must be "module"');
        }
    });

    test('correctly resolves ESM files', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/javascript-ecmascript-module');
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
                            content: "import { foo } from './foo';\n",
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
                            content: "export const foo = 'foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    }
                ],
                dependencies: {},
                mainFile: {
                    content: "import { foo } from './foo';\n",
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

    test('correctly resolves ESM files with export from statements', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/javascript-ecmascript-module-export-from');
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
                            content: "export * from './foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "export const foo = 'foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    }
                ],
                dependencies: {},
                mainFile: {
                    content: "export * from './foo';\n",
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

    test('correctly resolves ESM files with plain import statements', async function () {
        const fixture = path.join(
            process.cwd(),
            'integration-tests/fixtures/javascript-ecmascript-module-plain-import'
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
                    name: 'the-package-name',
                    sideEffects: [ './foo.js' ],
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
                            content: "import './foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "console.log('foo');\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: {
                            survivingBindings: new Set<string>(),
                            sideEffectStatements: [ { line: 1, kind: 'expression statement' } ],
                            sideEffectImports: new Set<string>()
                        }
                    }
                ],
                dependencies: {},
                mainFile: {
                    content: "import './foo';\n",
                    isExecutable: false,
                    inputFilePath: path.join(fixture, 'source/entry.js'),
                    targetFilePath: 'entry.js'
                },
                name: 'the-package-name',
                packageType: 'module',
                peerDependencies: {},
                sideEffectsField: [ './foo.js' ],
                typesMainFile: undefined,
                version: '42.0.0'
            })
        );
    });

    test('correctly resolves ESM files with dynamic import literals', async function () {
        const fixture = path.join(
            process.cwd(),
            'integration-tests/fixtures/javascript-ecmascript-module-dynamic-import'
        );
        const interpolationMarker = '$';
        const entryContent = [
            'export async function loadValues() {',
            "    const foo = await import('./foo.js');",
            '    const bar = await import(`./bar.js`);',
            `    return \`${interpolationMarker}{foo.foo}-${interpolationMarker}{bar.bar}\`;`,
            '}',
            ''
        ]
            .join('\n');
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
                        directDependencies: new Set([
                            path.join(fixture, 'source/foo.js'),
                            path.join(fixture, 'source/bar.js')
                        ]),
                        fileDescription: {
                            content: entryContent,
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('loadValues')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "export const foo = 'foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
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
                    }
                ],
                dependencies: {},
                mainFile: {
                    content: entryContent,
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
});
