import path from 'node:path';
import assert from 'node:assert';
import { test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../dce-helpers.ts';
import { loadPackageJson } from '../load-package-json.ts';

test('resolves node_modules dependencies correctly when depending on @types/* packages', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/type-roots-node-modules');
    const result = await packageProcessor.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [
            { js: path.join(fixture, 'src/entry.js'), declarationFile: path.join(fixture, 'src/entry.d.ts') }
        ],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: false,
        additionalFiles: [],
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {},
        allowMutableSpecifiers: [],
        deadCodeElimination: { enabled: false }
    });

    assert.deepStrictEqual(result, {
        additionalAttributes: {},
        packageJson: {
            dependencies: {
                foo: '21.0.0',
                '@types/foo': '42.0.0'
            },
            main: 'entry.js',
            name: 'the-package-name',
            sideEffects: ['./foo.js'],
            version: '42.0.0',
            types: 'entry.d.ts',
            type: 'module'
        },
        contents: [
            {
                directDependencies: new Set([path.join(fixture, 'src/foo.js')]),
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
                directDependencies: new Set(),
                fileDescription: {
                    content: "import { bar } from 'foo';\nexport const foo = bar('foo');\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.js'),
                    targetFilePath: 'foo.js'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false,
                analysis: {
                    survivingBindings: new Set(['bar', 'foo']),
                    sideEffectStatements: [{ line: 2, kind: 'variable initializer' }],
                    sideEffectImports: new Set<string>()
                }
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/foo.d.ts')]),
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
                directDependencies: new Set(),
                fileDescription: {
                    content: "export type Bar = string;\nexport type { Foo } from 'foo';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.d.ts'),
                    targetFilePath: 'foo.d.ts'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false,
                analysis: bindingAnalysis('Bar')
            }
        ],
        manifestFile: {
            content:
                '{\n    "dependencies": {\n        "@types/foo": "42.0.0",\n        "foo": "21.0.0"\n    },\n    "main": "entry.js",\n    "name": "the-package-name",\n    "sideEffects": [\n        "./foo.js"\n    ],\n    "type": "module",\n    "types": "entry.d.ts",\n    "version": "42.0.0"\n}',
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
            sourceFilePath: path.join(fixture, 'src/entry.js'),
            targetFilePath: 'entry.js'
        },
        name: 'the-package-name',
        packageType: 'module',
        peerDependencies: {},
        sideEffectsField: ['./foo.js'],
        typesMainFile: {
            content: "export declare const foo: import('./foo.js').Foo;\n",
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry.d.ts'),
            targetFilePath: 'entry.d.ts'
        },
        version: '42.0.0'
    });
});
