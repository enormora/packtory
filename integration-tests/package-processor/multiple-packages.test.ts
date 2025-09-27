import path from 'node:path';
import test from 'ava';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';

test('bundles and substitutes multiple packages correctly', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
    const firstBundle = await packageProcessor.build({
        name: 'first',
        version: '1.2.3',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [
            { js: path.join(fixture, 'src/entry1.js'), declarationFile: path.join(fixture, 'src/entry1.d.ts') }
        ],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: true,
        additionalFiles: [],
        moduleResolution: 'module',
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {}
    });
    const secondBundle = await packageProcessor.build({
        name: 'second',
        version: '2.3.4',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [
            { js: path.join(fixture, 'src/entry2.js'), declarationFile: path.join(fixture, 'src/entry2.d.ts') }
        ],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: true,
        bundleDependencies: [firstBundle],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {},
        additionalFiles: [],
        moduleResolution: 'module'
    });
    const thirdBundle = await packageProcessor.build({
        name: 'third',
        version: '3.4.5',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [
            { js: path.join(fixture, 'src/entry3.js'), declarationFile: path.join(fixture, 'src/entry3.d.ts') }
        ],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: true,
        bundleDependencies: [firstBundle],
        bundlePeerDependencies: [secondBundle],
        additionalPackageJsonAttributes: {},
        additionalFiles: [],
        moduleResolution: 'module'
    });

    t.deepEqual(firstBundle, {
        additionalAttributes: {},
        packageJson: {
            main: 'entry1.js',
            types: 'entry1.d.ts',
            name: 'first',
            version: '1.2.3',
            type: 'module'
        },
        manifestFile: {
            isExecutable: false,
            content:
                '{\n    "main": "entry1.js",\n    "name": "first",\n    "type": "module",\n    "types": "entry1.d.ts",\n    "version": "1.2.3"\n}',
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
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/qux.js.map')]),
                fileDescription: {
                    content: "export const qux = 'qux';\n//# sourceMappingURL=qux.js.map\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/qux.js'),
                    targetFilePath: 'qux.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content:
                        '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry1.js.map'),
                    targetFilePath: 'entry1.js.map'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content:
                        '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/qux.js.map'),
                    targetFilePath: 'qux.js.map'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/foo.d.ts')]),
                fileDescription: {
                    content: "export declare const foo: import('./foo.js').Foo;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry1.d.ts'),
                    targetFilePath: 'entry1.d.ts'
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
            content: "import { qux } from './qux.js';\n//# sourceMappingURL=entry1.js.map\n",
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry1.js'),
            targetFilePath: 'entry1.js'
        },
        name: 'first',
        packageType: 'module',
        peerDependencies: {},
        typesMainFile: {
            content: "export declare const foo: import('./foo.js').Foo;\n",
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry1.d.ts'),
            targetFilePath: 'entry1.d.ts'
        },
        version: '1.2.3'
    });
    t.deepEqual(secondBundle, {
        additionalAttributes: {},
        packageJson: {
            dependencies: { first: '1.2.3' },
            main: 'entry2.js',
            name: 'second',
            version: '2.3.4',
            types: 'entry2.d.ts',
            type: 'module'
        },
        manifestFile: {
            isExecutable: false,
            content:
                '{\n    "dependencies": {\n        "first": "1.2.3"\n    },\n    "main": "entry2.js",\n    "name": "second",\n    "type": "module",\n    "types": "entry2.d.ts",\n    "version": "2.3.4"\n}',
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
                isSubstituted: false
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
                isSubstituted: true
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content:
                        '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry2.js.map'),
                    targetFilePath: 'entry2.js.map'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content:
                        '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/bar.js.map'),
                    targetFilePath: 'bar.js.map'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry2.d.ts'),
                    targetFilePath: 'entry2.d.ts',
                    content: "export declare const foo: import('first/foo.d.ts').Foo;\n"
                },
                isSubstituted: true
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
        typesMainFile: {
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry2.d.ts'),
            targetFilePath: 'entry2.d.ts',
            content: "export declare const foo: import('./foo.js').Foo;\n"
        },
        version: '2.3.4'
    });
    t.deepEqual(thirdBundle, {
        additionalAttributes: {},
        packageJson: {
            dependencies: { first: '1.2.3' },
            peerDependencies: { second: '2.3.4' },
            main: 'entry3.js',
            types: 'entry3.d.ts',
            name: 'third',
            version: '3.4.5',
            type: 'module'
        },
        manifestFile: {
            isExecutable: false,
            content:
                '{\n    "dependencies": {\n        "first": "1.2.3"\n    },\n    "main": "entry3.js",\n    "name": "third",\n    "peerDependencies": {\n        "second": "2.3.4"\n    },\n    "type": "module",\n    "types": "entry3.d.ts",\n    "version": "3.4.5"\n}',
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
                isSubstituted: false
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
                isSubstituted: true
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content:
                        '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry3.js.map'),
                    targetFilePath: 'entry3.js.map'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content:
                        '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.js.map'),
                    targetFilePath: 'foo.js.map'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry3.d.ts'),
                    targetFilePath: 'entry3.d.ts',
                    content: "export declare const foo: import('first/foo.d.ts').Foo;\n"
                },
                isSubstituted: true
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
        typesMainFile: {
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry3.d.ts'),
            targetFilePath: 'entry3.d.ts',
            content: "export declare const foo: import('./foo.js').Foo;\n"
        },
        version: '3.4.5'
    });
});
