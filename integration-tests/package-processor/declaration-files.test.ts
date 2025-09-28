import path from 'node:path';
import test from 'ava';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';

test('adds declaration files correctly to the bundle', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-and-d-ts');
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
        moduleResolution: 'module',
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {}
    });

    t.deepEqual(result, {
        additionalAttributes: {},
        packageJson: {
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0',
            types: 'entry.d.ts',
            type: 'module'
        },
        manifestFile: {
            isExecutable: false,
            content:
                '{\n    "main": "entry.js",\n    "name": "the-package-name",\n    "type": "module",\n    "types": "entry.d.ts",\n    "version": "42.0.0"\n}',
            filePath: 'package.json'
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
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/bar.js')]),
                fileDescription: {
                    content: "import { bar } from './bar.js';\nexport const foo = 'foo';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.js'),
                    targetFilePath: 'foo.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: "export const bar = 'bar';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/bar.js'),
                    targetFilePath: 'bar.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/foo.d.ts')]),
                fileDescription: {
                    content: "export declare const foo: import('./foo.js').Foo;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.d.ts'),
                    targetFilePath: 'entry.d.ts'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/baz.d.ts')]),
                fileDescription: {
                    content: "import { Baz } from './baz.js';\nexport type Foo = string;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.d.ts'),
                    targetFilePath: 'foo.d.ts'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: 'export type Baz = number;\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/baz.d.ts'),
                    targetFilePath: 'baz.d.ts'
                },
                isSubstituted: false
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
        typesMainFile: {
            content: "export declare const foo: import('./foo.js').Foo;\n",
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry.d.ts'),
            targetFilePath: 'entry.d.ts'
        },
        version: '42.0.0'
    });
});
