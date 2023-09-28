import path from 'node:path';
import test from 'ava';
import { bundler } from '../../source/bundler.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';

// eslint-disable-next-line max-lines-per-function -- this test cases tests a complex scenario with multiple packages and dependencies
test('bundles and substitutes multiple packages correctly', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
    const firstBundle = await bundler.build({
        name: 'first',
        version: '1.2.3',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [
            { js: path.join(fixture, 'src/entry1.js'), declarationFile: path.join(fixture, 'src/entry1.d.ts') }
        ],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: true
    });
    const secondBundle = await bundler.build({
        name: 'second',
        version: '2.3.4',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [
            { js: path.join(fixture, 'src/entry2.js'), declarationFile: path.join(fixture, 'src/entry2.d.ts') }
        ],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: true,
        bundleDependencies: [firstBundle]
    });
    const thirdBundle = await bundler.build({
        name: 'third',
        version: '3.4.5',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [
            { js: path.join(fixture, 'src/entry3.js'), declarationFile: path.join(fixture, 'src/entry3.d.ts') }
        ],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: true,
        bundleDependencies: [firstBundle],
        bundlePeerDependencies: [secondBundle]
    });

    t.deepEqual(firstBundle, {
        packageJson: {
            dependencies: {},
            main: 'entry1.js',
            types: 'entry1.d.ts',
            name: 'first',
            version: '1.2.3',
            type: 'module'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {},\n    "main": "entry1.js",\n    "name": "first",\n    "type": "module",\n    "types": "entry1.d.ts",\n    "version": "1.2.3"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry1.js'),
                targetFilePath: 'entry1.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry1.js.map'),
                targetFilePath: 'entry1.js.map'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/qux.js'),
                targetFilePath: 'qux.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/qux.js.map'),
                targetFilePath: 'qux.js.map'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry1.d.ts'),
                targetFilePath: 'entry1.d.ts'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/foo.d.ts'),
                targetFilePath: 'foo.d.ts'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/baz.d.ts'),
                targetFilePath: 'baz.d.ts'
            }
        ]
    });
    t.deepEqual(secondBundle, {
        packageJson: {
            dependencies: { first: '1.2.3' },
            main: 'entry2.js',
            name: 'second',
            version: '2.3.4',
            types: 'entry2.d.ts',
            type: 'module'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {\n        "first": "1.2.3"\n    },\n    "main": "entry2.js",\n    "name": "second",\n    "type": "module",\n    "types": "entry2.d.ts",\n    "version": "2.3.4"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry2.js'),
                targetFilePath: 'entry2.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry2.js.map'),
                targetFilePath: 'entry2.js.map'
            },
            {
                kind: 'substituted',
                sourceFilePath: path.join(fixture, 'src/bar.js'),
                targetFilePath: 'bar.js',
                source: "import { qux } from 'first/qux.js';\nexport const bar = 'bar';\n//# sourceMappingURL=bar.js.map\n"
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/bar.js.map'),
                targetFilePath: 'bar.js.map'
            },
            {
                kind: 'substituted',
                sourceFilePath: path.join(fixture, 'src/entry2.d.ts'),
                targetFilePath: 'entry2.d.ts',
                source: "export declare const foo: import('first/foo.d.ts').Foo;\n"
            }
        ]
    });
    t.deepEqual(thirdBundle, {
        packageJson: {
            dependencies: { first: '1.2.3' },
            peerDependencies: { second: '2.3.4' },
            main: 'entry3.js',
            types: 'entry3.d.ts',
            name: 'third',
            version: '3.4.5',
            type: 'module'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {\n        "first": "1.2.3"\n    },\n    "main": "entry3.js",\n    "name": "third",\n    "peerDependencies": {\n        "second": "2.3.4"\n    },\n    "type": "module",\n    "types": "entry3.d.ts",\n    "version": "3.4.5"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry3.js'),
                targetFilePath: 'entry3.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry3.js.map'),
                targetFilePath: 'entry3.js.map'
            },
            {
                kind: 'substituted',
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js',
                source: "import { bar } from 'second/bar.js';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n"
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/foo.js.map'),
                targetFilePath: 'foo.js.map'
            },
            {
                kind: 'substituted',
                sourceFilePath: path.join(fixture, 'src/entry3.d.ts'),
                targetFilePath: 'entry3.d.ts',
                source: "export declare const foo: import('first/foo.d.ts').Foo;\n"
            }
        ]
    });
});
