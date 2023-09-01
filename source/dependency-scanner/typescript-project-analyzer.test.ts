import {test} from 'node:test';
import assert from 'node:assert';
import {stub, fake, SinonSpy, SinonStub} from 'sinon';
import {
    createTypescriptProjectAnalyzer,
    TypescriptProjectAnalyzer,
    TypescriptProjectAnalyzerDependencies
} from './typescript-project-analyzer.js';

interface FakeSourceFile {
    readonly getFilePath: SinonSpy;
    readonly isDeclarationFile: SinonSpy;
}

interface FakeSourceFileOverrides {
    filePath?: string;
    isDeclarationFile?: boolean
}

function createFakeSourceFile(overrides: FakeSourceFileOverrides = {}): FakeSourceFile {
    const {filePath = '', isDeclarationFile = false} = overrides;
    return {getFilePath: fake.returns(filePath), isDeclarationFile: fake.returns(isDeclarationFile)};
}

interface TSMorphProjectOverrides {
    readonly addSourceFilesAtPaths?: SinonSpy;
    readonly getSourceFile?: SinonSpy;
    readonly getPreEmitDiagnostics?: SinonSpy;
}

function createFakeTSMorphProject(overrides: TSMorphProjectOverrides = {}): SinonStub {
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

interface Overrides {
    readonly getReferencedSourceFiles?: SinonSpy;
    readonly TSMorphProject?: SinonStub;
}

function typescriptProjectAnalyzerFactory(overrides: Overrides = {}): TypescriptProjectAnalyzer {
    const {TSMorphProject = createFakeTSMorphProject(), getReferencedSourceFiles = fake.resolves([])} = overrides;
    const fakeDependencies = {
        getReferencedSourceFiles,
        Project: TSMorphProject
    } as unknown as TypescriptProjectAnalyzerDependencies;

    return createTypescriptProjectAnalyzer(fakeDependencies);
}

test('creates a project for all js files in the given folder with module resolution', () => {
    const addSourceFilesAtPaths = fake();
    const TSMorphProject = createFakeTSMorphProject({addSourceFilesAtPaths});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject});


    analyzer.analyzeProject('/foo', {moduleResolution: 'module', resolveDeclarationFiles: false, failOnCompileErrors: false});

    assert.strictEqual(TSMorphProject.callCount, 1);
    assert.strictEqual(TSMorphProject.calledWithNew(), true);
    assert.deepStrictEqual(TSMorphProject.firstCall.args, [ {compilerOptions: {allowJs: true, module: 100, esModuleInterop: true, maxNodeModuleJsDepth: 1, noEmit: true, moduleResolution: 3}} ]);
    assert.strictEqual(addSourceFilesAtPaths.callCount, 1);
    assert.deepStrictEqual(addSourceFilesAtPaths.firstCall.args, [ [ '/foo/**/*.js' ] ]);
});

test('creates a project for all js files in the given folder with commonjs resolution', () => {
    const addSourceFilesAtPaths = fake();
    const TSMorphProject = createFakeTSMorphProject({addSourceFilesAtPaths});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject});


    analyzer.analyzeProject('/foo', {moduleResolution: 'common-js', resolveDeclarationFiles: false, failOnCompileErrors: false});

    assert.strictEqual(TSMorphProject.callCount, 1);
    assert.strictEqual(TSMorphProject.calledWithNew(), true);
    assert.deepStrictEqual(TSMorphProject.firstCall.args, [ {compilerOptions: {allowJs: true, module: 1, esModuleInterop: true, maxNodeModuleJsDepth: 1, noEmit: true, moduleResolution: 3}} ]);
    assert.strictEqual(addSourceFilesAtPaths.callCount, 1);
    assert.deepStrictEqual(addSourceFilesAtPaths.firstCall.args, [ [ '/foo/**/*.js' ] ]);
});

test('creates a project for all d.ts files in the given folder', () => {
    const addSourceFilesAtPaths = fake();
    const TSMorphProject = createFakeTSMorphProject({addSourceFilesAtPaths});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject});


    analyzer.analyzeProject('/foo', {moduleResolution: 'module', resolveDeclarationFiles: true, failOnCompileErrors: false});

    assert.strictEqual(TSMorphProject.callCount, 1);
    assert.strictEqual(TSMorphProject.calledWithNew(), true);
    assert.deepStrictEqual(TSMorphProject.firstCall.args, [ {compilerOptions: {allowJs: true, module: 100, esModuleInterop: true, maxNodeModuleJsDepth: 1, noEmit: true, moduleResolution: 3}} ]);
    assert.strictEqual(addSourceFilesAtPaths.callCount, 1);
    assert.deepStrictEqual(addSourceFilesAtPaths.firstCall.args, [ [ '/foo/**/*.d.ts' ] ]);
});

test('creates a project and doesn’t throw when there are pre-emit diagnostics and failOnCompileErrors is false', () => {
    const getPreEmitDiagnostics = fake.returns([ {} ]);
    const TSMorphProject = createFakeTSMorphProject({getPreEmitDiagnostics});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject});


    assert.doesNotThrow(() => {
        analyzer.analyzeProject('/foo', {moduleResolution: 'module', resolveDeclarationFiles: false, failOnCompileErrors: false});
    });

    assert.strictEqual(getPreEmitDiagnostics.callCount, 0);
});

test('creates a project and doesn’t throw when there are no pre-emit diagnostics and failOnCompileErrors is true', () => {
    const getPreEmitDiagnostics = fake.returns([]);
    const TSMorphProject = createFakeTSMorphProject({getPreEmitDiagnostics});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject});


    assert.doesNotThrow(() => {
        analyzer.analyzeProject('/foo', {moduleResolution: 'module', resolveDeclarationFiles: false, failOnCompileErrors: true});
    });

    assert.strictEqual(getPreEmitDiagnostics.callCount, 1);
});

test('throws when there are pre-emit diagnostics and failOnCompileErrors is true', () => {
    const getPreEmitDiagnostics = fake.returns([ {} ]);
    const TSMorphProject = createFakeTSMorphProject({getPreEmitDiagnostics});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject});


    try {
        analyzer.analyzeProject('/foo', {moduleResolution: 'module', resolveDeclarationFiles: false, failOnCompileErrors: true});
        assert.fail('Expected analyzeProject() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to analyze source files');
    }
});

test('getReferencedSourceFilePaths() returns an empty array when the source file for given path doesn’t exist', () => {
    const getSourceFile = fake.returns(undefined);
    const TSMorphProject = createFakeTSMorphProject({getSourceFile});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject});

    const project = analyzer.analyzeProject('/foo', {moduleResolution: 'module', resolveDeclarationFiles: false, failOnCompileErrors: false});
    const result = project.getReferencedSourceFilePaths('/foo/bar.js');

    assert.deepStrictEqual(result, []);
});

test('getReferencedSourceFilePaths() returns the referenced source file paths as js when resolveDeclarationFiles is false', () => {
    const getReferencedSourceFiles = fake.returns([
        createFakeSourceFile({filePath: '/foo/b.d.ts', isDeclarationFile: true}),
        createFakeSourceFile({filePath: '/foo/c.js', isDeclarationFile: false}),
    ]);
    const getSourceFile = fake.returns(createFakeSourceFile({filePath: '/foo/a.js'}));
    const TSMorphProject = createFakeTSMorphProject({getSourceFile});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject, getReferencedSourceFiles});

    const project = analyzer.analyzeProject('/foo', {moduleResolution: 'module', resolveDeclarationFiles: false, failOnCompileErrors: false});
    const result = project.getReferencedSourceFilePaths('/foo/a.js');

    assert.deepStrictEqual(result, [ '/foo/b.js', '/foo/c.js' ]);
});

test('getReferencedSourceFilePaths() returns the referenced source file paths as .d.ts when resolveDeclarationFiles is true', () => {
    const getReferencedSourceFiles = fake.returns([
        createFakeSourceFile({filePath: '/foo/b.d.ts', isDeclarationFile: true}),
        createFakeSourceFile({filePath: '/foo/c.d.ts', isDeclarationFile: false}),
    ]);
    const getSourceFile = fake.returns(createFakeSourceFile({filePath: '/foo/a.d.ts'}));
    const TSMorphProject = createFakeTSMorphProject({getSourceFile});
    const analyzer = typescriptProjectAnalyzerFactory({TSMorphProject, getReferencedSourceFiles});

    const project = analyzer.analyzeProject('/foo', {moduleResolution: 'module', resolveDeclarationFiles: true, failOnCompileErrors: false});
    const result = project.getReferencedSourceFilePaths('/foo/a.d.ts');

    assert.deepStrictEqual(result, [ '/foo/b.d.ts', '/foo/c.d.ts' ]);
});
