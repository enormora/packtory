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

type TSMorphProjectOverrides = {
    readonly addSourceFilesAtPaths?: SinonSpy;
    readonly getSourceFile?: SinonSpy;
};

function createFakeTSMorphProject(overrides: TSMorphProjectOverrides = {}): Readonly<SinonStub> {
    const { addSourceFilesAtPaths = fake(), getSourceFile = fake.returns(createFakeSourceFile()) } = overrides;

    return stub().returns({
        addSourceFilesAtPaths,
        getSourceFile
    });
}

type Overrides = {
    readonly getReferencedModules?: SinonSpy;
    readonly TSMorphProject?: Readonly<SinonStub>;
    readonly fileSystemAdapters?: Readonly<Record<string, unknown>>;
};

type ExpectedProjectConstructionArgs = {
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
        TSMorphProject = createFakeTSMorphProject(),
        getReferencedModules = fake.resolves([]),
        fileSystemAdapters = {
            withVirtualPackageJson: fake.returns('virtual-file-system')
        }
    } = overrides;
    const fakeDependencies = {
        getReferencedModules,
        Project: TSMorphProject,
        fileSystemAdapters
    } as unknown as TypescriptProjectAnalyzerDependencies;

    return createTypescriptProjectAnalyzer(fakeDependencies);
}

function expectedProjectConstruction(args: ExpectedProjectConstructionArgs): unknown[] {
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
                resolveJsonModule: true,
                skipLibCheck: true,
                resolvePackageJsonImports: true,
                ...args.extra
            },
            fileSystem: args.fileSystem
        }
    ];
}

function runAnalyzeProjectExpectingArgs(testArgs: AnalyzeProjectExpectation): void {
    const addSourceFilesAtPaths = fake();
    const TSMorphProject = createFakeTSMorphProject({ addSourceFilesAtPaths });
    const analyzer = typescriptProjectAnalyzerFactory({
        TSMorphProject,
        fileSystemAdapters: testArgs.fileSystemAdapters
    });

    analyzer.analyzeProject('/foo', {
        resolveDeclarationFiles: testArgs.resolveDeclarationFiles,
        mainPackageJson: { type: 'module' }
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
    assertDeepSubset(addSourceFilesAtPaths, {
        callCount: 1,
        firstCall: {
            args: [ [ testArgs.expectedFilesGlob ] ]
        }
    });
}

suite('typescript-project-analyzer', function () {
    test('creates a project for all js files in the given folder with module resolution', function () {
        const withVirtualPackageJson = fake.returns('virtualized-filtering-declaration-files');
        runAnalyzeProjectExpectingArgs({
            resolveDeclarationFiles: false,
            fileSystemAdapters: {
                fileSystemHostFilteringDeclarationFiles: 'filtering-declaration-files',
                withVirtualPackageJson
            },
            expectedModule: 100,
            expectedFileSystem: 'virtualized-filtering-declaration-files',
            expectedFilesGlob: '/foo/**/*.js',
            expectedExtra: { typeRoots: [], types: [] }
        });
    });

    test('creates a project for all d.ts files in the given folder', function () {
        const withVirtualPackageJson = fake.returns('virtualized-no-filtering');
        runAnalyzeProjectExpectingArgs({
            resolveDeclarationFiles: true,
            fileSystemAdapters: {
                fileSystemHostWithoutFilter: 'no-filtering',
                withVirtualPackageJson
            },
            expectedModule: 100,
            expectedFileSystem: 'virtualized-no-filtering',
            expectedFilesGlob: '/foo/**/*.d.ts'
        });
    });

    test('getReferencedModules() returns an empty array when the source file for given path doesn’t exist', function () {
        const getSourceFile = fake.returns(undefined);
        const TSMorphProject = createFakeTSMorphProject({ getSourceFile });
        const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

        const project = analyzer.analyzeProject('/foo', {
            resolveDeclarationFiles: false,
            mainPackageJson: { type: 'module' }
        });
        const result = project.getReferencedModules('/foo/bar.js');

        assert.deepStrictEqual(result, []);
    });

    test('getProject() exposes the underlying ts-morph project instance', function () {
        const TSMorphProject = createFakeTSMorphProject();
        const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject });

        const project = analyzer.analyzeProject('/foo', {
            resolveDeclarationFiles: false,
            mainPackageJson: { type: 'module' }
        });

        assert.strictEqual(project.getProject(), TSMorphProject.firstCall.returnValue);
    });

    test('getReferencedModules() returns the referenced module descriptors', function () {
        const getReferencedModules = fake.returns([
            { kind: 'local-code', filePath: '/foo/b.d.ts' },
            { kind: 'local-code', filePath: '/foo/c.js' }
        ]);
        const getSourceFile = fake.returns(createFakeSourceFile({ filePath: '/foo/a.js' }));
        const TSMorphProject = createFakeTSMorphProject({ getSourceFile });
        const analyzer = typescriptProjectAnalyzerFactory({ TSMorphProject, getReferencedModules });

        const project = analyzer.analyzeProject('/foo', {
            resolveDeclarationFiles: false,
            mainPackageJson: { type: 'module' }
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

    test('passes the configured mainPackageJson into the virtual file-system overlay', function () {
        const addSourceFilesAtPaths = fake();
        const TSMorphProject = createFakeTSMorphProject({ addSourceFilesAtPaths });
        const withVirtualPackageJson = fake.returns('virtualized-file-system');
        const analyzer = typescriptProjectAnalyzerFactory({
            TSMorphProject,
            fileSystemAdapters: {
                fileSystemHostFilteringDeclarationFiles: 'filtering-declaration-files',
                withVirtualPackageJson
            }
        });

        const mainPackageJson = { type: 'module' as const, imports: { '#foo': './src/foo.js' } };

        analyzer.analyzeProject('/foo', { resolveDeclarationFiles: false, mainPackageJson });

        assert.deepStrictEqual(withVirtualPackageJson.args, [ [
            'filtering-declaration-files',
            '/foo',
            mainPackageJson
        ] ]);
    });
});
