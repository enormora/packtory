import {test} from 'node:test';
import assert from 'node:assert';
import {createBundler, Bundler, BundlerDependencies} from './bundler.js';
import {buildDependencyGraph} from '../test-libraries/dependency-graph-builder.js';
import {fake, SinonSpy, stub} from 'sinon';

interface Overrides {
    scan?: SinonSpy;
}

function bundlerFactory(overrides: Overrides = {}): Bundler {
    const {scan = fake.resolves(buildDependencyGraph())} = overrides;
    const fakeDependencies = {dependencyScanner: {scan}} as unknown as BundlerDependencies;
    return createBundler(fakeDependencies);
}

test('scans only the given js entry-point file', async () => {
    const graph = buildDependencyGraph({
        entries: [ {filePath: '/foo/bar.js', content: 'true', } ]
    })
    const scan = fake.resolves(graph);
    const bundler = bundlerFactory({scan});

    await bundler.build({
        sourcesFolder: '/foo',
        entryPoints: [ {js: '/foo/bar.js'} ],
        name: 'the-name',
        version: 'the-version',
        mainPackageJson: {}
    });

    assert.strictEqual(scan.callCount, 1);
    assert.deepStrictEqual(scan.firstCall.args, [ '/foo/bar.js', '/foo', {includeSourceMapFiles: false, mainPackageJson: {}, moduleResolution: 'common-js'} ]);
});

test('scans the given js entry-point file with module resolution', async () => {
    const graph = buildDependencyGraph({
        entries: [ {filePath: '/foo/bar.js', content: 'true', } ]
    })
    const scan = fake.resolves(graph);
    const bundler = bundlerFactory({scan});

    await bundler.build({
        sourcesFolder: '/foo',
        entryPoints: [ {js: '/foo/bar.js'} ],
        name: 'the-name',
        version: 'the-version',
        mainPackageJson: {type: 'module'},
    });

    assert.strictEqual(scan.callCount, 1);
    assert.deepStrictEqual(scan.firstCall.args, [ '/foo/bar.js', '/foo', {includeSourceMapFiles: false, mainPackageJson: {type: 'module'}, moduleResolution: 'module'} ]);
});

test('scans the given js entry-point file with includeSourceMapFiles option set to true', async () => {
    const graph = buildDependencyGraph({
        entries: [ {filePath: '/foo/bar.js', content: 'true', } ]
    })
    const scan = fake.resolves(graph);
    const bundler = bundlerFactory({scan});

    await bundler.build({
        sourcesFolder: '/foo',
        entryPoints: [ {js: '/foo/bar.js'} ],
        name: 'the-name',
        version: 'the-version',
        mainPackageJson: {},
        includeSourceMapFiles: true
    });

    assert.strictEqual(scan.callCount, 1);
    assert.deepStrictEqual(scan.firstCall.args, [ '/foo/bar.js', '/foo', {includeSourceMapFiles: true, mainPackageJson: {}, moduleResolution: 'common-js'} ]);
});

test('scans the given js and declaration entry-point files', async () => {
    const firstGraph = buildDependencyGraph({
        entries: [ {filePath: '/foo/bar.js', content: 'true', } ]
    })
    const secondGraph = buildDependencyGraph({
        entries: [ {filePath: '/foo/bar.d.ts', content: 'true', } ]
    })
    const scan = stub().onFirstCall().resolves(firstGraph).onSecondCall().resolves(secondGraph);
    const bundler = bundlerFactory({scan});

    await bundler.build({
        sourcesFolder: '/foo',
        entryPoints: [ {js: '/foo/bar.js', declarationFile: '/foo/bar.d.ts'} ],
        name: 'the-name',
        version: 'the-version',
        mainPackageJson: {}
    });

    assert.strictEqual(scan.callCount, 2);
    assert.deepStrictEqual(scan.firstCall.args, [ '/foo/bar.js', '/foo', {includeSourceMapFiles: false, mainPackageJson: {}, moduleResolution: 'common-js'} ]);
    assert.deepStrictEqual(scan.secondCall.args, [ '/foo/bar.d.ts', '/foo', {includeSourceMapFiles: false, mainPackageJson: {}, moduleResolution: 'common-js', includeDevDependencies: true, resolveDeclarationFiles: true} ]);
});

test('builds a bundle for a single file with the correct package.json', async () => {
    const graph = buildDependencyGraph({
        entries: [ {filePath: '/foo/bar.js', content: 'true', topLevelDependencies: new Map([ [ 'pkg', '42' ] ])} ]
    })
    const scan = fake.resolves(graph);
    const bundler = bundlerFactory({scan});

    const bundle = await bundler.build({
        sourcesFolder: '/foo',
        entryPoints: [ {js: '/foo/bar.js'} ],
        name: 'the-name',
        version: 'the-version',
        mainPackageJson: {}
    });

    assert.deepStrictEqual(bundle, {
        contents: [
            {kind: 'source', source: '{\n    "name": "the-name",\n    "version": "the-version",\n    "dependencies": {\n        "pkg": "42"\n    },\n    "main": "bar.js"\n}', targetFilePath: 'package.json'},
            {kind: 'reference', sourceFilePath: '/foo/bar.js', targetFilePath: 'bar.js'}
        ],
        packageJson: {
            name: 'the-name',
            version: 'the-version',
            dependencies: {pkg: '42'},
            main: 'bar.js'
        }
    });
});

test('builds a bundle for a single file with the additional package.json fields', async () => {
    const graph = buildDependencyGraph({
        entries: [ {filePath: '/foo/bar.js', content: 'true', } ]
    })
    const scan = fake.resolves(graph);
    const bundler = bundlerFactory({scan});

    const bundle = await bundler.build({
        sourcesFolder: '/foo',
        entryPoints: [ {js: '/foo/bar.js'} ],
        name: 'the-name',
        version: 'the-version',
        mainPackageJson: {},
        additionalPackageJsonAttributes: {
            license: 'Beerware'
        }
    });

    assert.deepStrictEqual(bundle, {
        contents: [
            {kind: 'source', source: '{\n    "license": "Beerware",\n    "name": "the-name",\n    "version": "the-version",\n    "dependencies": {},\n    "main": "bar.js"\n}', targetFilePath: 'package.json'},
            {kind: 'reference', sourceFilePath: '/foo/bar.js', targetFilePath: 'bar.js'}
        ],
        packageJson: {
            name: 'the-name',
            version: 'the-version',
            dependencies: {},
            main: 'bar.js',
            license: 'Beerware'
        }
    });
});

test('builds a bundle for a single file with the module type from the main package.json', async () => {
    const graph = buildDependencyGraph({
        entries: [ {filePath: '/foo/bar.js', content: 'true', } ]
    })
    const scan = fake.resolves(graph);
    const bundler = bundlerFactory({scan});

    const bundle = await bundler.build({
        sourcesFolder: '/foo',
        entryPoints: [ {js: '/foo/bar.js'} ],
        name: 'the-name',
        version: 'the-version',
        mainPackageJson: { type: 'module' },
    });

    assert.deepStrictEqual(bundle, {
        contents: [
            {kind: 'source', source: '{\n    "name": "the-name",\n    "version": "the-version",\n    "dependencies": {},\n    "main": "bar.js",\n    "type": "module"\n}', targetFilePath: 'package.json'},
            {kind: 'reference', sourceFilePath: '/foo/bar.js', targetFilePath: 'bar.js'}
        ],
        packageJson: {
            name: 'the-name',
            version: 'the-version',
            dependencies: {},
            main: 'bar.js',
            type: 'module'
        }
    });
});


test('builds a bundle for a project with matching dependencies and peerDependencies correctly', async () => {
    const graph = buildDependencyGraph({
        entries: [
            {
                filePath: '/folder/entry.js',
                content: 'import "./foo.js"; import "./bar.js";',
                topLevelDependencies: new Map([ [ 'pkg', '2' ] ]),
                dependencies: [ {
                    filePath: "/folder/foo.js",
                    content: 'true',
                }, {
                    filePath: "/folder/bar.js",
                    content: 'true'
                } ]
            }
        ]
    })
    const scan = fake.resolves(graph);
    const bundler = bundlerFactory({scan});

    const bundle = await bundler.build({
        sourcesFolder: '/folder',
        entryPoints: [ {js: '/folder/entry.js'} ],
        name: 'the-name',
        version: 'the-version',
        mainPackageJson: {},
        dependencies: [ {
            contents: [ {kind: 'reference', targetFilePath: 'foo.js', sourceFilePath: '/folder/foo.js', } ],
            packageJson: {name: 'first', version: '1'}
        } ],
        peerDependencies: [ {
            contents: [ {kind: 'reference', targetFilePath: 'bar.js', sourceFilePath: '/folder/bar.js', } ],
            packageJson: {name: 'second', version: '3'}
        }
        ]
    });

    assert.deepStrictEqual(bundle, {
        contents: [
            {kind: 'source', source: '{\n    "name": "the-name",\n    "version": "the-version",\n    "dependencies": {\n        "first": "1",\n        "pkg": "2"\n    },\n    "main": "entry.js",\n    "peerDependencies": {\n        "second": "3"\n    }\n}', targetFilePath: 'package.json'},
            {kind: 'substituted', source: 'import "first/foo.js"; import "second/bar.js";', sourceFilePath: '/folder/entry.js', targetFilePath: 'entry.js'}
        ],
        packageJson: {
            name: 'the-name',
            version: 'the-version',
            dependencies: {first: '1', pkg: '2'},
            peerDependencies: {second: '3'},
            main: 'entry.js',
        }
    });
});

test('throws when the same bundle dependency is listed more than once', async () => {
    const bundler = bundlerFactory();

    try {
        await bundler.build({
            sourcesFolder: '/folder',
            entryPoints: [ {js: '/folder/entry.js'} ],
            name: 'the-name',
            version: 'the-version',
            mainPackageJson: {},
            dependencies: [ {
                contents: [],
                packageJson: {name: 'a-dependency', version: '1'}
            } ],
            peerDependencies: [ {
                contents: [],
                packageJson: {name: 'a-dependency', version: '2'}
            }
            ]
        });
        assert.fail('Expected build() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'The following packages are listed more than once in dependencies or peerDependencies: a-dependency');
    }
});
