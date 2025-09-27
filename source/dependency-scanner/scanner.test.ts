import test from 'ava';
import { stub, fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createDependencyScanner, type DependencyScanner, type DependencyScannerDependencies } from './scanner.js';

type ProjectOverrides = {
    readonly getReferencedSourceFilePaths?: SinonSpy;
    readonly getSourceFile?: SinonSpy;
    readonly getProject?: SinonSpy;
};

function createFakeAnalyzeProject(overrides: ProjectOverrides = {}): Readonly<SinonSpy> {
    const {
        getReferencedSourceFilePaths = fake.returns([]),
        getSourceFile = fake.returns({}),
        getProject = fake.returns({})
    } = overrides;

    return fake.returns({
        getReferencedSourceFilePaths,
        getSourceFile,
        getProject
    });
}

type Overrides = {
    readonly locate?: SinonSpy;
    readonly analyzeProject?: Readonly<SinonSpy>;
};

function dependencyScannerFactory(overrides: Overrides = {}): DependencyScanner {
    const { analyzeProject = createFakeAnalyzeProject(), locate = fake.resolves(null) } = overrides;
    const fakeDependencies = {
        sourceMapFileLocator: { locate },
        typescriptProjectAnalyzer: { analyzeProject }
    } as unknown as DependencyScannerDependencies;

    return createDependencyScanner(fakeDependencies);
}

test('analyzes the given entryPoint file in the given folder as a typescript project', async (t) => {
    const analyzeProject = createFakeAnalyzeProject();
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    await dependencyScanner.scan('/foo/bar.js', '/foo', { moduleResolution: 'module' });

    t.is(analyzeProject.callCount, 1);
    t.deepEqual(analyzeProject.firstCall.args, [
        '/foo',
        { failOnCompileErrors: false, moduleResolution: 'module', resolveDeclarationFiles: false }
    ]);
});

test('passes the failOnCompileErrors option to the project analyzer', async (t) => {
    const analyzeProject = createFakeAnalyzeProject();
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    await dependencyScanner.scan('/foo/bar.js', '/foo', { moduleResolution: 'module', failOnCompileErrors: true });

    t.is(analyzeProject.callCount, 1);
    t.deepEqual(analyzeProject.firstCall.args, [
        '/foo',
        { failOnCompileErrors: true, moduleResolution: 'module', resolveDeclarationFiles: false }
    ]);
});

test('passes the resolveDeclarationFiles option to the project analyzer', async (t) => {
    const analyzeProject = createFakeAnalyzeProject();
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    await dependencyScanner.scan('/foo/bar.js', '/foo', { moduleResolution: 'module', resolveDeclarationFiles: true });

    t.is(analyzeProject.callCount, 1);
    t.deepEqual(analyzeProject.firstCall.args, [
        '/foo',
        { failOnCompileErrors: false, moduleResolution: 'module', resolveDeclarationFiles: true }
    ]);
});

test('passes the moduleResolution option to the project analyzer', async (t) => {
    const analyzeProject = createFakeAnalyzeProject();
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    await dependencyScanner.scan('/foo/bar.js', '/foo', { moduleResolution: 'common-js' });

    t.is(analyzeProject.callCount, 1);
    t.deepEqual(analyzeProject.firstCall.args, [
        '/foo',
        { failOnCompileErrors: false, moduleResolution: 'common-js', resolveDeclarationFiles: false }
    ]);
});

test('scans the dependencies of the given entryPoint file', async (t) => {
    const getReferencedSourceFilePaths = fake.returns([]);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    await dependencyScanner.scan('/foo/bar.js', '/foo', { moduleResolution: 'module' });

    t.is(getReferencedSourceFilePaths.callCount, 1);
    t.deepEqual(getReferencedSourceFilePaths.firstCall.args, ['/foo/bar.js']);
});

test('returns no dependencies if the given file doesn’t have any dependencies', async (t) => {
    const getReferencedSourceFilePaths = fake.returns([]);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir');
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result, {
        localFiles: [{ directDependencies: new Set(), filePath: '/dir/entry.js', project: {} }],
        externalDependencies: new Map()
    });
});

test('doesn’t try to locate source map files by default', async (t) => {
    const locate = fake.resolves(Maybe.nothing());
    const dependencyScanner = dependencyScannerFactory({ locate });

    await dependencyScanner.scan('/dir/entry.js', '/dir');

    t.is(locate.callCount, 0);
});

test('tries to locate source map files for all local files when includeSourceMapFiles is true', async (t) => {
    const locate = fake.resolves(Maybe.nothing());
    const getReferencedSourceFilePaths = stub()
        .onFirstCall()
        .returns(['/dir/foo.js'])
        .onSecondCall()
        .returns(['/dir/bar.js'])
        .onThirdCall()
        .returns([]);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject, locate });

    await dependencyScanner.scan('/dir/entry.js', '/dir', { includeSourceMapFiles: true });

    t.is(locate.callCount, 3);
    t.deepEqual(locate.firstCall.args, ['/dir/entry.js']);
    t.deepEqual(locate.secondCall.args, ['/dir/foo.js']);
    t.deepEqual(locate.thirdCall.args, ['/dir/bar.js']);
});

test('returns no additional dependencies for source maps if they don’t exist', async (t) => {
    const locate = fake.resolves(Maybe.nothing());
    const getReferencedSourceFilePaths = fake.returns([]);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject, locate });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', { includeSourceMapFiles: true });
    const result = graph.flatten('/dir/entry.js');

    t.is(locate.callCount, 1);
    t.deepEqual(result, {
        localFiles: [{ directDependencies: new Set(), filePath: '/dir/entry.js', project: {} }],
        externalDependencies: new Map()
    });
});

test('returns additional dependencies for source maps if they exist', async (t) => {
    const locate = fake.resolves(Maybe.just('/dir/foo.map'));
    const getReferencedSourceFilePaths = fake.returns([]);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject, locate });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', { includeSourceMapFiles: true });
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result, {
        localFiles: [
            { directDependencies: new Set(), filePath: '/dir/foo.map', project: {} },
            { directDependencies: new Set(['/dir/foo.map']), filePath: '/dir/entry.js', project: {} }
        ],
        externalDependencies: new Map()
    });
});

test('returns no additional dependencies for source maps if they exist, but includeSourceMapFiles is false', async (t) => {
    const locate = fake.resolves(Maybe.just('/dir/foo.map'));
    const getReferencedSourceFilePaths = fake.returns([]);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject, locate });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', { includeSourceMapFiles: false });
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result, {
        localFiles: [{ directDependencies: new Set(), filePath: '/dir/entry.js', project: {} }],
        externalDependencies: new Map()
    });
});

test('returns the local dependency files', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/foo.js', '/dir/bar.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir');
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.localFiles, [
        { directDependencies: new Set(['/dir/foo.js', '/dir/bar.js']), filePath: '/dir/entry.js', project: {} },
        { directDependencies: new Set(['/dir/foo.js', '/dir/bar.js']), filePath: '/dir/foo.js', project: {} },
        { directDependencies: new Set(['/dir/foo.js', '/dir/bar.js']), filePath: '/dir/bar.js', project: {} }
    ]);
});

test('returns the local dependency files found in subsequent dependencies', async (t) => {
    const getReferencedSourceFilePaths = stub()
        .onFirstCall()
        .returns(['/dir/foo.js', '/dir/bar.js'])
        .onSecondCall()
        .returns([])
        .onThirdCall()
        .returns(['/dir/baz.js'])
        .onCall(3)
        .returns([]);
    const dependencyScanner = dependencyScannerFactory({
        analyzeProject: createFakeAnalyzeProject({ getReferencedSourceFilePaths })
    });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir');
    const result = graph.flatten('/dir/entry.js');

    t.is(getReferencedSourceFilePaths.callCount, 4);
    t.deepEqual(getReferencedSourceFilePaths.firstCall.args, ['/dir/entry.js']);
    t.deepEqual(getReferencedSourceFilePaths.secondCall.args, ['/dir/foo.js']);
    t.deepEqual(getReferencedSourceFilePaths.thirdCall.args, ['/dir/bar.js']);
    t.deepEqual(getReferencedSourceFilePaths.getCall(3).args, ['/dir/baz.js']);
    t.deepEqual(result.localFiles, [
        { directDependencies: new Set(['/dir/foo.js', '/dir/bar.js']), filePath: '/dir/entry.js', project: {} },
        { directDependencies: new Set([]), filePath: '/dir/foo.js', project: {} },
        { directDependencies: new Set(['/dir/baz.js']), filePath: '/dir/bar.js', project: {} },
        { directDependencies: new Set(), filePath: '/dir/baz.js', project: {} }
    ]);
});

test('doesn’t include any files from node_modules in localFiles', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/foo.js', '/dir/node_modules/any-module/bar.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {});
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.localFiles, [
        { directDependencies: new Set(['/dir/foo.js']), filePath: '/dir/entry.js', project: {} },
        { directDependencies: new Set(['/dir/foo.js']), filePath: '/dir/foo.js', project: {} }
    ]);
});

test('returns all detected node_modules dependencies with its corresponding version', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/node_modules/any-module/foo.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {});
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(
        result.externalDependencies,
        new Map([['any-module', { name: 'any-module', referencedFrom: ['/dir/entry.js'] }]])
    );
});

test('throws an error when an invalid node_modules path is returned', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/invalid/node_modules/']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    try {
        await dependencyScanner.scan('/dir/entry.js', '/dir');
        t.fail('Expected scan() to throw but it didn’t');
    } catch (error: unknown) {
        t.is((error as Error).message, "Couldn’t find node_modules package name for '/invalid/node_modules/'");
    }
});

test('doesn’t include the same dependency twice', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/foo.js', '/dir/foo.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {});
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.localFiles, [
        { directDependencies: new Set(['/dir/foo.js']), filePath: '/dir/entry.js', project: {} },
        { directDependencies: new Set(['/dir/foo.js']), filePath: '/dir/foo.js', project: {} }
    ]);
});
