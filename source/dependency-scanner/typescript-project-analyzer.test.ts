import assert from 'node:assert';
import { test } from 'mocha';
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

function createAnalyzedProjectForGetSourceFileTest(): {
    readonly project: ReturnType<TypescriptProjectAnalyzer['analyzeProject']>;
    readonly sourceFile: FakeSourceFile;
    readonly getSourceFile: SinonSpy;
} {
    const sourceFile = createFakeSourceFile({ filePath: '/foo/source-file.ts' });
    const getSourceFile = fake((filePath: string) => {
        return filePath === '/foo/source-file.ts' ? sourceFile : undefined;
    });
    const TSMorphProject = createFakeTSMorphProject({ getSourceFile });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });
    const project = analyzer.analyzeProject('/foo', {
        moduleResolution: 'module',
        resolveDeclarationFiles: false,
        failOnCompileErrors: false
    });

    return { project, sourceFile, getSourceFile };
}

function expectedProjectConstruction(args: {
    readonly module: number;
    readonly fileSystem: string;
    readonly extra?: Record<string, unknown> | undefined;
}): unknown[] {
    return [
        {
            compilerOptions: {
                allowJs: true,
                module: args.module,
                esModuleInterop: true,
                maxNodeModuleJsDepth: 1,
                noEmit: true,
                moduleResolution: 3,
                noLib: true,
                skipLibCheck: true,
                ...args.extra
            },
            fileSystem: args.fileSystem
        }
    ];
}

function runAnalyzeProjectExpectingArgs(testArgs: {
    readonly moduleResolution: 'module';
    readonly resolveDeclarationFiles: boolean;
    readonly fileSystemAdapters: Record<string, unknown>;
    readonly expectedModule: number;
    readonly expectedFileSystem: string;
    readonly expectedFilesGlob: string;
    readonly expectedExtra?: Record<string, unknown>;
}): void {
    const addSourceFilesAtPaths = fake();
    const TSMorphProject = createFakeTSMorphProject({ addSourceFilesAtPaths });
    const analyzer = typescriptProjectAnalyzerFactory({
        TSMorphProject,
        fileSystemAdapters: testArgs.fileSystemAdapters
    });

    analyzer.analyzeProject('/foo', {
        moduleResolution: testArgs.moduleResolution,
        resolveDeclarationFiles: testArgs.resolveDeclarationFiles,
        failOnCompileErrors: false
    });

    assert.strictEqual(TSMorphProject.callCount, 1);
    assert.strictEqual(TSMorphProject.calledWithNew(), true);
    assert.deepStrictEqual(
        TSMorphProject.firstCall.args,
        expectedProjectConstruction({
            module: testArgs.expectedModule,
            fileSystem: testArgs.expectedFileSystem,
            extra: testArgs.expectedExtra
        })
    );
    assert.strictEqual(addSourceFilesAtPaths.callCount, 1);
    assert.deepStrictEqual(addSourceFilesAtPaths.firstCall.args, [[testArgs.expectedFilesGlob]]);
}

test('creates a project for all js files in the given folder with module resolution', () => {
    runAnalyzeProjectExpectingArgs({
        moduleResolution: 'module',
        resolveDeclarationFiles: false,
        fileSystemAdapters: { fileSystemHostFilteringDeclarationFiles: 'filtering-declaration-files' },
        expectedModule: 100,
        expectedFileSystem: 'filtering-declaration-files',
        expectedFilesGlob: '/foo/**/*.js',
        expectedExtra: { typeRoots: [], types: [] }
    });
});

test('creates a project for all d.ts files in the given folder', () => {
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

    assert.strictEqual(TSMorphProject.callCount, 1);
    assert.strictEqual(TSMorphProject.calledWithNew(), true);
    assert.deepStrictEqual(
        TSMorphProject.firstCall.args,
        expectedProjectConstruction({ module: 100, fileSystem: 'no-filtering' })
    );
    assert.strictEqual(addSourceFilesAtPaths.callCount, 1);
    assert.deepStrictEqual(addSourceFilesAtPaths.firstCall.args, [['/foo/**/*.d.ts']]);
});

test('creates a project and doesn’t throw when there are pre-emit diagnostics and failOnCompileErrors is false', () => {
    const getPreEmitDiagnostics = fake.returns([{}]);
    const TSMorphProject = createFakeTSMorphProject({ getPreEmitDiagnostics });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

    analyzer.analyzeProject('/foo', {
        moduleResolution: 'module',
        resolveDeclarationFiles: false,
        failOnCompileErrors: false
    });

    assert.strictEqual(getPreEmitDiagnostics.callCount, 0);
});

test('creates a project and doesn’t throw when there are no pre-emit diagnostics and failOnCompileErrors is true', () => {
    const getPreEmitDiagnostics = fake.returns([]);
    const TSMorphProject = createFakeTSMorphProject({ getPreEmitDiagnostics });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

    analyzer.analyzeProject('/foo', {
        moduleResolution: 'module',
        resolveDeclarationFiles: false,
        failOnCompileErrors: true
    });

    assert.strictEqual(getPreEmitDiagnostics.callCount, 1);
});

test('throws when there are pre-emit diagnostics and failOnCompileErrors is true', () => {
    const getPreEmitDiagnostics = fake.returns([{}]);
    const TSMorphProject = createFakeTSMorphProject({ getPreEmitDiagnostics });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

    try {
        analyzer.analyzeProject('/foo', {
            moduleResolution: 'module',
            resolveDeclarationFiles: false,
            failOnCompileErrors: true
        });
        assert.fail('Expected analyzeProject() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to analyze source files');
    }
});

test('getReferencedSourceFilePaths() returns an empty array when the source file for given path doesn’t exist', () => {
    const getSourceFile = fake.returns(undefined);
    const TSMorphProject = createFakeTSMorphProject({ getSourceFile });
    const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

    const project = analyzer.analyzeProject('/foo', {
        moduleResolution: 'module',
        resolveDeclarationFiles: false,
        failOnCompileErrors: false
    });
    const result = project.getReferencedSourceFilePaths('/foo/bar.js');

    assert.deepStrictEqual(result, []);
});

test('getReferencedSourceFilePaths() returns the referenced source file paths', () => {
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

    assert.deepStrictEqual(result, ['/foo/b.d.ts', '/foo/c.js']);
});

test('getSourceFile() returns the requested source file and throws when it does not exist', () => {
    const { project, sourceFile, getSourceFile } = createAnalyzedProjectForGetSourceFileTest();

    assert.strictEqual(project.getSourceFile('/foo/source-file.ts'), sourceFile);

    try {
        project.getSourceFile('/foo/missing.ts');
        assert.fail('Expected getSourceFile() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to find source file for "/foo/missing.ts"');
    }

    assert.strictEqual(project.getProject().getSourceFile, getSourceFile);
});
