import test from 'ava';
import { stub, fake, type SinonSpy, type SinonStub } from 'sinon';
import {
    createTypescriptProjectAnalyzer,
    type TypescriptProjectAnalyzer,
    type TypescriptProjectAnalyzerDependencies
} from './typescript-project-analyzer.ts';

type FakeSourceFile = {
    readonly getFilePath: SinonSpy;
    readonly isDeclarationFile: SinonSpy;
};

type FakeSourceFileOverrides = {
    readonly filePath?: string;
    readonly isDeclarationFile?: boolean;
};

function createFakeSourceFile(overrides: FakeSourceFileOverrides = {}): FakeSourceFile {
    const { filePath = '', isDeclarationFile = false } = overrides;
    return { getFilePath: fake.returns(filePath), isDeclarationFile: fake.returns(isDeclarationFile) };
}

type TSMorphProjectOverrides = {
    readonly addSourceFilesAtPaths?: SinonSpy;
    readonly getSourceFile?: SinonSpy;
    readonly getPreEmitDiagnostics?: SinonSpy;
};

function createFakeTSMorphProject(overrides: TSMorphProjectOverrides = {}): Readonly<SinonStub> {
    const {
        addSourceFilesAtPaths = fake(),
        getSourceFile = fake.returns(createFakeSourceFile()),
        getPreEmitDiagnostics = fake.returns([])
    } = overrides;

    return stub().returns({
        addSourceFilesAtPaths,
        getSourceFile,
        getPreEmitDiagnostics
    });
}

type Overrides = {
    readonly getReferencedSourceFiles?: SinonSpy;
    readonly TSMorphProject?: Readonly<SinonStub>;
    readonly fileSystemAdapters?: Record<string, unknown>;
};

function typescriptProjectAnalyzerFactory(overrides: Overrides = {}): TypescriptProjectAnalyzer {
    const {
        TSMorphProject = createFakeTSMorphProject(),
        getReferencedSourceFiles = fake.resolves([]),
        fileSystemAdapters = {}
    } = overrides;
    const fakeDependencies = {
        getReferencedSourceFiles,
        Project: TSMorphProject,
        fileSystemAdapters
    } as unknown as TypescriptProjectAnalyzerDependencies;

    return createTypescriptProjectAnalyzer(fakeDependencies);
}

test('creates a project for all js files in the given folder with module resolution', (t) => {
    const addSourceFilesAtPaths = fake();
    const TSMorphProject = createFakeTSMorphProject({ addSourceFilesAtPaths });
    const analyzer = typescriptProjectAnalyzerFactory({
        TSMorphProject,
        fileSystemAdapters: {
            fileSystemHostFilteringDeclarationFiles: 'filtering-declaration-files'
        }
    });

    analyzer.analyzeProject('/foo', {
        moduleResolution: 'module',
        resolveDeclarationFiles: false,
        failOnCompileErrors: false
    });

    t.is(TSMorphProject.callCount, 1);
    t.is(TSMorphProject.calledWithNew(), true);
    t.deepEqual(TSMorphProject.firstCall.args, [
        {
            compilerOptions: {
                allowJs: true,
                module: 100,
                esModuleInterop: true,
                maxNodeModuleJsDepth: 1,
                noEmit: true,
                moduleResolution: 3,
                noLib: true,
                skipLibCheck: true,
                typeRoots: [],
                types: []
            },
            fileSystem: 'filtering-declaration-files'
        }
    ]);
    t.is(addSourceFilesAtPaths.callCount, 1);
    t.deepEqual(addSourceFilesAtPaths.firstCall.args, [['/foo/**/*.js']]);
});

test('creates a project for all js files in the given folder with commonjs resolution', (t) => {
    const addSourceFilesAtPaths = fake();
    const TSMorphProject = createFakeTSMorphProject({ addSourceFilesAtPaths });
    const analyzer = typescriptProjectAnalyzerFactory({
        TSMorphProject,
        fileSystemAdapters: {
            fileSystemHostFilteringDeclarationFiles: 'filtering-declaration-files'
        }
    });

    analyzer.analyzeProject('/foo', {
        moduleResolution: 'common-js',
        resolveDeclarationFiles: false,
        failOnCompileErrors: false
    });

    t.is(TSMorphProject.callCount, 1);
    t.is(TSMorphProject.calledWithNew(), true);
    t.deepEqual(TSMorphProject.firstCall.args, [
        {
            compilerOptions: {
                allowJs: true,
                module: 1,
                esModuleInterop: true,
                maxNodeModuleJsDepth: 1,
                noEmit: true,
                moduleResolution: 3,
                noLib: true,
                skipLibCheck: true,
                typeRoots: [],
                types: []
            },
            fileSystem: 'filtering-declaration-files'
        }
    ]);
    t.is(addSourceFilesAtPaths.callCount, 1);
    t.deepEqual(addSourceFilesAtPaths.firstCall.args, [['/foo/**/*.js']]);
});

test('creates a project for all d.ts files in the given folder', (t) => {
    const addSourceFilesAtPaths = fake();
    const TSMorphProject = createFakeTSMorphProject({ addSourceFilesAtPaths });
    const analyzer = typescriptProjectAnalyzerFactory({
        TSMorphProject,
        fileSystemAdapters: { fileSystemHostWithoutFilter: 'no-filtering' }
    });

    analyzer.analyzeProject('/foo', {
        moduleResolution: 'module',
        resolveDeclarationFiles: true,
        failOnCompileErrors: false
    });

    t.is(TSMorphProject.callCount, 1);
    t.is(TSMorphProject.calledWithNew(), true);
    t.deepEqual(TSMorphProject.firstCall.args, [
        {
            compilerOptions: {
                allowJs: true,
                module: 100,
                esModuleInterop: true,
                maxNodeModuleJsDepth: 1,
                noEmit: true,
                moduleResolution: 3,
                noLib: true,
                skipLibCheck: true
            },
            fileSystem: 'no-filtering'
        }
    ]);
    t.is(addSourceFilesAtPaths.callCount, 1);
    t.deepEqual(addSourceFilesAtPaths.firstCall.args, [['/foo/**/*.d.ts']]);
});

test('creates a project and doesn’t throw when there are pre-emit diagnostics and failOnCompileErrors is false', (t) => {
    const getPreEmitDiagnostics = fake.returns([{}]);
    const TSMorphProject = createFakeTSMorphProject({ getPreEmitDiagnostics });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

    t.notThrows(() => {
        analyzer.analyzeProject('/foo', {
            moduleResolution: 'module',
            resolveDeclarationFiles: false,
            failOnCompileErrors: false
        });
    });

    t.is(getPreEmitDiagnostics.callCount, 0);
});

test('creates a project and doesn’t throw when there are no pre-emit diagnostics and failOnCompileErrors is true', (t) => {
    const getPreEmitDiagnostics = fake.returns([]);
    const TSMorphProject = createFakeTSMorphProject({ getPreEmitDiagnostics });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

    t.notThrows(() => {
        analyzer.analyzeProject('/foo', {
            moduleResolution: 'module',
            resolveDeclarationFiles: false,
            failOnCompileErrors: true
        });
    });

    t.is(getPreEmitDiagnostics.callCount, 1);
});

test('throws when there are pre-emit diagnostics and failOnCompileErrors is true', (t) => {
    const getPreEmitDiagnostics = fake.returns([{}]);
    const TSMorphProject = createFakeTSMorphProject({ getPreEmitDiagnostics });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

    try {
        analyzer.analyzeProject('/foo', {
            moduleResolution: 'module',
            resolveDeclarationFiles: false,
            failOnCompileErrors: true
        });
        t.fail('Expected analyzeProject() to fail but it did not');
    } catch (error: unknown) {
        t.is((error as Error).message, 'Failed to analyze source files');
    }
});

test('getReferencedSourceFilePaths() returns an empty array when the source file for given path doesn’t exist', (t) => {
    const getSourceFile = fake.returns(undefined);
    const TSMorphProject = createFakeTSMorphProject({ getSourceFile });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

    const project = analyzer.analyzeProject('/foo', {
        moduleResolution: 'module',
        resolveDeclarationFiles: false,
        failOnCompileErrors: false
    });
    const result = project.getReferencedSourceFilePaths('/foo/bar.js');

    t.deepEqual(result, []);
});

test('getReferencedSourceFilePaths() returns the referenced source file paths', (t) => {
    const getReferencedSourceFiles = fake.returns([
        createFakeSourceFile({ filePath: '/foo/b.d.ts', isDeclarationFile: true }),
        createFakeSourceFile({ filePath: '/foo/c.js', isDeclarationFile: false })
    ]);
    const getSourceFile = fake.returns(createFakeSourceFile({ filePath: '/foo/a.js' }));
    const TSMorphProject = createFakeTSMorphProject({ getSourceFile });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject, getReferencedSourceFiles });

    const project = analyzer.analyzeProject('/foo', {
        moduleResolution: 'module',
        resolveDeclarationFiles: false,
        failOnCompileErrors: false
    });
    const result = project.getReferencedSourceFilePaths('/foo/a.js');

    t.deepEqual(result, ['/foo/b.d.ts', '/foo/c.js']);
});
