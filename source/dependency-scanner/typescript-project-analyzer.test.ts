import assert from 'node:assert';
import { suite, test } from 'mocha';
import { stub, fake, type SinonSpy, type SinonStub } from 'sinon';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
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

type TypeScriptMorphProjectOverrides = {
    readonly addSourceFilesAtPaths?: SinonSpy;
    readonly getSourceFile?: SinonSpy;
};

function createFakeTypeScriptMorphProject(overrides: TypeScriptMorphProjectOverrides = {}): Readonly<SinonStub> {
    const { addSourceFilesAtPaths = fake(), getSourceFile = fake.returns(createFakeSourceFile()) } = overrides;

    return stub().returns({
        addSourceFilesAtPaths,
        getSourceFile
    });
}

type Overrides = {
    readonly getReferencedModules?: SinonSpy;
    readonly TypeScriptMorphProject?: Readonly<SinonStub>;
    readonly fileSystemAdapters?: Readonly<Record<string, unknown>>;
};

type ExpectedProjectConstructionArguments = {
    readonly module: number;
    readonly fileSystem: string;
    readonly extra?: Readonly<Record<string, unknown>> | undefined;
};

type AnalyzeProjectExpectation = {
    readonly resolveDeclarationFiles: boolean;
    readonly fileSystemAdapters: Readonly<Record<string, unknown>>;
    readonly expectedModule: number;
    readonly expectedFileSystem: string;
    readonly expectedFilesGlob: string;
    readonly expectedExtra?: Readonly<Record<string, unknown>>;
};

function typescriptProjectAnalyzerFactory(overrides: Overrides = {}): TypescriptProjectAnalyzer {
    const {
        TypeScriptMorphProject = createFakeTypeScriptMorphProject(),
        getReferencedModules = fake.resolves([]),
        fileSystemAdapters = {
            withVirtualPackageManifest: fake.returns('virtual-file-system')
        }
    } = overrides;
    const fakeDependencies = {
        getReferencedModules,
        Project: TypeScriptMorphProject,
        fileSystemAdapters
    } as unknown as TypescriptProjectAnalyzerDependencies;

    return createTypescriptProjectAnalyzer(fakeDependencies);
}

function expectedProjectConstruction(input: ExpectedProjectConstructionArguments): unknown[] {
    return [
        {
            compilerOptions: {
                allowJs: true,
                module: input.module,
                esModuleInterop: true,
                maxNodeModuleJsDepth: 1,
                noEmit: true,
                moduleResolution: 3,
                noLib: true,
                resolveJsonModule: true,
                skipLibCheck: true,
                resolvePackageJsonImports: true,
                ...input.extra
            },
            fileSystem: input.fileSystem
        }
    ];
}

function runAnalyzeProjectExpectingArguments(testArguments: AnalyzeProjectExpectation): void {
    const addSourceFilesAtPaths = fake();
    const TypeScriptMorphProject = createFakeTypeScriptMorphProject({ addSourceFilesAtPaths });
    const analyzer = typescriptProjectAnalyzerFactory({
        TypeScriptMorphProject,
        fileSystemAdapters: testArguments.fileSystemAdapters
    });

    analyzer.analyzeProject('/foo', {
        resolveDeclarationFiles: testArguments.resolveDeclarationFiles,
        mainPackageManifest: { type: 'module' }
    });

    assert.strictEqual(TypeScriptMorphProject.callCount, 1);
    assert.strictEqual(TypeScriptMorphProject.calledWithNew(), true);
    assert.deepStrictEqual(
        TypeScriptMorphProject.firstCall.args,
        expectedProjectConstruction({
            module: testArguments.expectedModule,
            fileSystem: testArguments.expectedFileSystem,
            extra: testArguments.expectedExtra
        })
    );
    assertDeepSubset(addSourceFilesAtPaths, {
        callCount: 1,
        firstCall: {
            arguments: [ [ testArguments.expectedFilesGlob ] ]
        }
    });
}

suite('typescript-project-analyzer', function () {
    test('creates a project for all runtime JavaScript files in the given folder with module resolution', function () {
        const withVirtualPackageManifest = fake.returns('virtualized-filtering-declaration-files');
        runAnalyzeProjectExpectingArguments({
            resolveDeclarationFiles: false,
            fileSystemAdapters: {
                fileSystemHostFilteringDeclarationFiles: 'filtering-declaration-files',
                withVirtualPackageManifest
            },
            expectedModule: 100,
            expectedFileSystem: 'virtualized-filtering-declaration-files',
            expectedFilesGlob: '/foo/**/*.{js,mjs,cjs}',
            expectedExtra: { typeRoots: [], types: [] }
        });
    });

    test('creates a project for all d.ts files in the given folder', function () {
        const withVirtualPackageManifest = fake.returns('virtualized-no-filtering');
        runAnalyzeProjectExpectingArguments({
            resolveDeclarationFiles: true,
            fileSystemAdapters: {
                fileSystemHostWithoutFilter: 'no-filtering',
                withVirtualPackageManifest
            },
            expectedModule: 100,
            expectedFileSystem: 'virtualized-no-filtering',
            expectedFilesGlob: '/foo/**/*.d.ts'
        });
    });

    test('getReferencedModules() returns an empty array when the source file for given path doesn’t exist', function () {
        const getSourceFile = fake.returns(undefined);
        const TypeScriptMorphProject = createFakeTypeScriptMorphProject({ getSourceFile });
        const analyzer = typescriptProjectAnalyzerFactory({ TypeScriptMorphProject });

        const project = analyzer.analyzeProject('/foo', {
            resolveDeclarationFiles: false,
            mainPackageManifest: { type: 'module' }
        });
        const result = project.getReferencedModules('/foo/bar.js');

        assert.deepStrictEqual(result, []);
    });

    test('getProject() exposes the underlying ts-morph project instance', function () {
        const TypeScriptMorphProject = createFakeTypeScriptMorphProject();
        const analyzer = typescriptProjectAnalyzerFactory({ TypeScriptMorphProject });

        const project = analyzer.analyzeProject('/foo', {
            resolveDeclarationFiles: false,
            mainPackageManifest: { type: 'module' }
        });

        assert.strictEqual(project.getProject(), TypeScriptMorphProject.firstCall.returnValue);
    });

    test('getReferencedModules() returns the referenced module descriptors', function () {
        const getReferencedModules = fake.returns([
            { kind: 'local-code', filePath: '/foo/b.d.ts' },
            { kind: 'local-code', filePath: '/foo/c.js' }
        ]);
        const getSourceFile = fake.returns(createFakeSourceFile({ filePath: '/foo/a.js' }));
        const TypeScriptMorphProject = createFakeTypeScriptMorphProject({ getSourceFile });
        const analyzer = typescriptProjectAnalyzerFactory({ TypeScriptMorphProject, getReferencedModules });

        const project = analyzer.analyzeProject('/foo', {
            resolveDeclarationFiles: false,
            mainPackageManifest: { type: 'module' }
        });
        const result = project.getReferencedModules('/foo/a.js');

        assert.deepStrictEqual(result, [
            { kind: 'local-code', filePath: '/foo/b.d.ts' },
            { kind: 'local-code', filePath: '/foo/c.js' }
        ]);
        assert.deepStrictEqual(getReferencedModules.firstCall.args, [
            getSourceFile.firstCall.returnValue,
            '/foo/package.json'
        ]);
    });

    test('passes the configured mainPackageManifest into the virtual file-system overlay', function () {
        const addSourceFilesAtPaths = fake();
        const TypeScriptMorphProject = createFakeTypeScriptMorphProject({ addSourceFilesAtPaths });
        const withVirtualPackageManifest = fake.returns('virtualized-file-system');
        const analyzer = typescriptProjectAnalyzerFactory({
            TypeScriptMorphProject,
            fileSystemAdapters: {
                fileSystemHostFilteringDeclarationFiles: 'filtering-declaration-files',
                withVirtualPackageManifest
            }
        });

        const mainPackageManifest = { type: 'module' as const, imports: { '#foo': './source/foo.js' } };

        analyzer.analyzeProject('/foo', { resolveDeclarationFiles: false, mainPackageManifest });

        assert.deepStrictEqual(withVirtualPackageManifest.args, [ [
            'filtering-declaration-files',
            '/foo',
            mainPackageManifest
        ] ]);
    });
});
