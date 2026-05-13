import path from 'node:path';
import assert from 'node:assert';
import { test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis, emptyAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

test('rejects packages whose mainPackageJson.type is not "module"', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-cjs');

    try {
        await packageProcessor.build({
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
            allowMutableSpecifiers: []
        });
        assert.fail('Expected packageProcessor.build() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'mainPackageJson.type must be "module"');
    }
});

test('correctly resolves ESM files', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm');
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
                    directDependencies: new Set([path.join(fixture, 'src/foo.js')]),
                    fileDescription: {
                        content: "import { foo } from './foo';\n",
                        isExecutable: false,
                        sourceFilePath: path.join(fixture, 'src/entry.js'),
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
                        sourceFilePath: path.join(fixture, 'src/foo.js'),
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
                sourceFilePath: path.join(fixture, 'src/entry.js'),
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

test('correctly resolves ESM files with export from statements', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-export-from');
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
                    directDependencies: new Set([path.join(fixture, 'src/foo.js')]),
                    fileDescription: {
                        content: "export * from './foo';\n",
                        isExecutable: false,
                        sourceFilePath: path.join(fixture, 'src/entry.js'),
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
                        sourceFilePath: path.join(fixture, 'src/foo.js'),
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
                sourceFilePath: path.join(fixture, 'src/entry.js'),
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

test('correctly resolves ESM files with plain import statements', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-plain-import');
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
                sideEffects: ['./foo.js'],
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
                    directDependencies: new Set([path.join(fixture, 'src/foo.js')]),
                    fileDescription: {
                        content: "import './foo';\n",
                        isExecutable: false,
                        sourceFilePath: path.join(fixture, 'src/entry.js'),
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
                        sourceFilePath: path.join(fixture, 'src/foo.js'),
                        targetFilePath: 'foo.js'
                    },
                    isExplicitlyIncluded: false,
                    isSubstituted: false,
                    analysis: {
                        survivingBindings: new Set<string>(),
                        sideEffectStatements: [{ line: 1, kind: 'expression statement' }],
                        sideEffectImports: new Set<string>()
                    }
                }
            ],
            dependencies: {},
            mainFile: {
                content: "import './foo';\n",
                isExecutable: false,
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            },
            name: 'the-package-name',
            packageType: 'module',
            peerDependencies: {},
            sideEffectsField: ['./foo.js'],
            typesMainFile: undefined,
            version: '42.0.0'
        })
    );
});
