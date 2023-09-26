import test from "ava"
import { stub, fake, SinonSpy } from 'sinon';
import { createDependencyScanner, DependencyScanner, DependencyScannerDependencies } from './scanner.js';
import { Maybe } from 'true-myth';

interface ProjectOverrides {
    readonly getReferencedSourceFilePaths?: SinonSpy;
    readonly getSourceFile?: SinonSpy;
}

function createFakeAnalyzeProject(overrides: ProjectOverrides = {}): SinonSpy {
    const { getReferencedSourceFilePaths = fake.returns([]), getSourceFile = fake.returns({}) } = overrides;

    return fake.returns({
        getReferencedSourceFilePaths,
        getSourceFile,
    });
}

interface Overrides {
    readonly locate?: SinonSpy;
    readonly analyzeProject?: SinonSpy;
}

function dependencyScannerFactory(overrides: Overrides = {}): DependencyScanner {
    const { analyzeProject = createFakeAnalyzeProject(), locate = fake.resolves(null) } = overrides;
    const fakeDependencies = {
        sourceMapFileLocator: { locate },
        typescriptProjectAnalyzer: { analyzeProject },
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
        { failOnCompileErrors: false, moduleResolution: 'module', resolveDeclarationFiles: false },
    ]);
});

test('passes the failOnCompileErrors option to the project analyzer', async (t) => {
    const analyzeProject = createFakeAnalyzeProject();
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    await dependencyScanner.scan('/foo/bar.js', '/foo', { moduleResolution: 'module', failOnCompileErrors: true });

    t.is(analyzeProject.callCount, 1);
    t.deepEqual(analyzeProject.firstCall.args, [
        '/foo',
        { failOnCompileErrors: true, moduleResolution: 'module', resolveDeclarationFiles: false },
    ]);
});

test('passes the resolveDeclarationFiles option to the project analyzer', async (t) => {
    const analyzeProject = createFakeAnalyzeProject();
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    await dependencyScanner.scan('/foo/bar.js', '/foo', { moduleResolution: 'module', resolveDeclarationFiles: true });

    t.is(analyzeProject.callCount, 1);
    t.deepEqual(analyzeProject.firstCall.args, [
        '/foo',
        { failOnCompileErrors: false, moduleResolution: 'module', resolveDeclarationFiles: true },
    ]);
});

test('passes the moduleResolution option to the project analyzer', async (t) => {
    const analyzeProject = createFakeAnalyzeProject();
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    await dependencyScanner.scan('/foo/bar.js', '/foo', { moduleResolution: 'common-js' });

    t.is(analyzeProject.callCount, 1);
    t.deepEqual(analyzeProject.firstCall.args, [
        '/foo',
        { failOnCompileErrors: false, moduleResolution: 'common-js', resolveDeclarationFiles: false },
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
        localFiles: [{ filePath: '/dir/entry.js', substitutionContent: Maybe.nothing() }],
        topLevelDependencies: {},
    });
});

test('doesn’t try to locate soure map files by default', async (t) => {
    const locate = fake.resolves(Maybe.nothing());
    const dependencyScanner = dependencyScannerFactory({ locate });

    await dependencyScanner.scan('/dir/entry.js', '/dir');

    t.is(locate.callCount, 0);
});

test('tries to locate soure map files for all local files when includeSourceMapFiles is true', async (t) => {
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
        localFiles: [{ filePath: '/dir/entry.js', substitutionContent: Maybe.nothing() }],
        topLevelDependencies: {},
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
            { filePath: '/dir/entry.js', substitutionContent: Maybe.nothing() },
            { filePath: '/dir/foo.map', substitutionContent: Maybe.nothing() },
        ],
        topLevelDependencies: {},
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
        localFiles: [{ filePath: '/dir/entry.js', substitutionContent: Maybe.nothing() }],
        topLevelDependencies: {},
    });
});

test('returns the local dependency files', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/foo.js', '/dir/bar.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir');
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.localFiles, [
        { filePath: '/dir/entry.js', substitutionContent: Maybe.nothing() },
        { filePath: '/dir/foo.js', substitutionContent: Maybe.nothing() },
        { filePath: '/dir/bar.js', substitutionContent: Maybe.nothing() },
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
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir');
    const result = graph.flatten('/dir/entry.js');

    t.is(getReferencedSourceFilePaths.callCount, 4);
    t.deepEqual(getReferencedSourceFilePaths.firstCall.args, ['/dir/entry.js']);
    t.deepEqual(getReferencedSourceFilePaths.secondCall.args, ['/dir/foo.js']);
    t.deepEqual(getReferencedSourceFilePaths.thirdCall.args, ['/dir/bar.js']);
    t.deepEqual(getReferencedSourceFilePaths.getCall(3).args, ['/dir/baz.js']);
    t.deepEqual(result.localFiles, [
        { filePath: '/dir/entry.js', substitutionContent: Maybe.nothing() },
        { filePath: '/dir/foo.js', substitutionContent: Maybe.nothing() },
        { filePath: '/dir/bar.js', substitutionContent: Maybe.nothing() },
        { filePath: '/dir/baz.js', substitutionContent: Maybe.nothing() },
    ]);
});

test('doesn’t include any files from node_modules in localFiles', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/foo.js', '/dir/node_modules/any-module/bar.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir');
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.localFiles, [
        { filePath: '/dir/entry.js', substitutionContent: Maybe.nothing() },
        { filePath: '/dir/foo.js', substitutionContent: Maybe.nothing() },
    ]);
});

test('returns all detected node_modules dependencies with its corresponding version', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/node_modules/any-module/foo.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
        mainPackageJson: { dependencies: { 'any-module': 'the-version' } },
    });
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.topLevelDependencies, { 'any-module': 'the-version' });
});

test('uses the version from devDependencies when includeDevDependencies is true', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/node_modules/any-module/foo.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
        mainPackageJson: { devDependencies: { 'any-module': 'the-version' } },
        includeDevDependencies: true,
    });
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.topLevelDependencies, { 'any-module': 'the-version' });
});

test('doesn’t include a node_modules package when package is only in devDependencies but includeDevDependencies is false', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/node_modules/any-module/foo.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
        mainPackageJson: { devDependencies: { 'any-module': 'the-version' } },
        includeDevDependencies: false,
    });
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.topLevelDependencies, {});
});

test('doesn’t include a node_modules package when package is not at all in the packageJson', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/node_modules/any-module/foo.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
        mainPackageJson: {},
        includeDevDependencies: true,
    });
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.topLevelDependencies, {});
});

test('throws an error when an invalid node_modules path is returned', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/invald/node_modules/']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    try {
        await dependencyScanner.scan('/dir/entry.js', '/dir');
        t.fail('Expected scan() to throw but it didn’t');
    } catch (error: unknown) {
        t.is(
            (error as Error).message,
            "Couldn’t find node_modules package name for '/invald/node_modules/'",
        );
    }
});

test('doesn’t include the same dependency twice', async (t) => {
    const getReferencedSourceFilePaths = fake.returns(['/dir/foo.js', '/dir/foo.js']);
    const analyzeProject = createFakeAnalyzeProject({ getReferencedSourceFilePaths });
    const dependencyScanner = dependencyScannerFactory({ analyzeProject });

    const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
        mainPackageJson: {},
        includeDevDependencies: true,
    });
    const result = graph.flatten('/dir/entry.js');

    t.deepEqual(result.localFiles, [
        { filePath: '/dir/entry.js', substitutionContent: Maybe.nothing() },
        { filePath: '/dir/foo.js', substitutionContent: Maybe.nothing() },
    ]);
});
