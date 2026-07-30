import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, stub, type SinonSpy, type SinonStub } from 'sinon';
import { ModuleKind, ModuleResolutionKind, ScriptTarget } from 'ts-morph';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import {
    createDeclarationProjectFactory,
    type DeclarationProject,
    type DeclarationProjectDependencies
} from './type-script-declaration-project.ts';

type FakeModuleSpecifier = {
    readonly getModuleSpecifierValue: SinonSpy;
};

function moduleSpecifier(value: string | undefined): FakeModuleSpecifier {
    return { getModuleSpecifierValue: fake.returns(value) };
}

type FakeSourceFileOverrides = {
    readonly filePath?: string;
    readonly imports?: readonly FakeModuleSpecifier[];
    readonly exports?: readonly FakeModuleSpecifier[];
    readonly line?: number;
};

type FakeSourceFile = {
    readonly getFilePath: SinonSpy;
    readonly getImportDeclarations: SinonSpy;
    readonly getExportDeclarations: SinonSpy;
    readonly getLineAndColumnAtPos: SinonSpy;
};

function createFakeSourceFile(overrides: FakeSourceFileOverrides = {}): FakeSourceFile {
    const { filePath = '/node_modules/pkg/index.d.ts', imports = [], exports = [], line = 1 } = overrides;
    return {
        getFilePath: fake.returns(filePath),
        getImportDeclarations: fake.returns(imports),
        getExportDeclarations: fake.returns(exports),
        getLineAndColumnAtPos: fake.returns({ line, column: 1 })
    };
}

type FakeDiagnostic = {
    readonly getSourceFile: SinonSpy;
    readonly getStart: SinonSpy;
    readonly getCode: SinonSpy;
    readonly compilerObject: { readonly messageText: unknown; };
};

type FakeDiagnosticParts = {
    readonly sourceFile: FakeSourceFile | undefined;
    readonly start: number | undefined;
    readonly code: number;
    readonly messageText: unknown;
};

function createFakeDiagnostic(parts: FakeDiagnosticParts): FakeDiagnostic {
    return {
        getSourceFile: fake.returns(parts.sourceFile),
        getStart: fake.returns(parts.start),
        getCode: fake.returns(parts.code),
        compilerObject: { messageText: parts.messageText }
    };
}

type FakeProjectOverrides = {
    readonly getSourceFileOrThrow?: SinonSpy;
    readonly getPreEmitDiagnostics?: SinonSpy;
    readonly createSourceFile?: SinonSpy;
};

function createFakeProjectConstructor(overrides: FakeProjectOverrides = {}): SinonStub {
    const {
        getSourceFileOrThrow = fake.returns(createFakeSourceFile()),
        getPreEmitDiagnostics = fake.returns([]),
        createSourceFile = fake()
    } = overrides;

    return stub().returns({ getSourceFileOrThrow, getPreEmitDiagnostics, createSourceFile });
}

function declarationProjectsFor(
    projectConstructor: SinonStub,
    packageFiles: readonly { readonly filePath: string; readonly content: string; }[] = []
): readonly DeclarationProject[] {
    const fakeDependencies = { Project: projectConstructor } as unknown as DeclarationProjectDependencies;
    return createDeclarationProjectFactory(fakeDependencies)('pkg', packageFiles);
}

function firstProject(projects: readonly DeclarationProject[]): DeclarationProject {
    const [ project ] = projects;
    if (project === undefined) {
        assert.fail('expected at least one declaration project');
    }
    return project;
}

const commonCompilerOptions = {
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: ScriptTarget.ESNext
};

suite('type-script-declaration-project', function () {
    test('creates one in-memory project per checked compiler mode', function () {
        const TSMorphProject = createFakeProjectConstructor();

        const projects = declarationProjectsFor(TSMorphProject);

        assert.deepStrictEqual(
            projects.map(function (project) {
                return project.modeLabel;
            }),
            [ 'node16-esm', 'bundler' ]
        );
        assert.strictEqual(TSMorphProject.calledWithNew(), true);
        assertDeepSubset(TSMorphProject, {
            firstCall: {
                args: [
                    {
                        useInMemoryFileSystem: true,
                        skipAddingFilesFromTsConfig: true,
                        compilerOptions: {
                            module: ModuleKind.Node16,
                            moduleResolution: ModuleResolutionKind.Node16,
                            ...commonCompilerOptions
                        }
                    }
                ]
            },
            secondCall: {
                args: [
                    {
                        useInMemoryFileSystem: true,
                        skipAddingFilesFromTsConfig: true,
                        compilerOptions: {
                            module: ModuleKind.ESNext,
                            moduleResolution: ModuleResolutionKind.Bundler,
                            ...commonCompilerOptions
                        }
                    }
                ]
            }
        });
    });

    test('adds every package file below the installed package folder', function () {
        const createSourceFile = fake();
        const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

        declarationProjectsFor(TSMorphProject, [
            { filePath: 'package.json', content: '{}' },
            { filePath: 'nested/index.d.ts', content: 'export declare const value: number;' }
        ]);

        assert.deepStrictEqual(createSourceFile.args, [
            [ '/node_modules/pkg/package.json', '{}' ],
            [ '/node_modules/pkg/nested/index.d.ts', 'export declare const value: number;' ],
            [ '/node_modules/pkg/package.json', '{}' ],
            [ '/node_modules/pkg/nested/index.d.ts', 'export declare const value: number;' ]
        ]);
    });

    test('moduleSpecifiersOf() reads import and export specifiers of the installed declaration', function () {
        const sourceFile = createFakeSourceFile({
            imports: [ moduleSpecifier('./leaf.js'), moduleSpecifier(undefined) ],
            exports: [ moduleSpecifier('./other.js') ]
        });
        const getSourceFileOrThrow = fake.returns(sourceFile);
        const TSMorphProject = createFakeProjectConstructor({ getSourceFileOrThrow });

        const specifiers = firstProject(declarationProjectsFor(TSMorphProject)).moduleSpecifiersOf('nested/index.d.ts');

        assert.deepStrictEqual(specifiers, [ './leaf.js', './other.js' ]);
        assert.deepStrictEqual(getSourceFileOrThrow.args, [ [ '/node_modules/pkg/nested/index.d.ts' ] ]);
    });

    test('listDiagnostics() reports package-relative paths, lines, codes and messages', function () {
        const getPreEmitDiagnostics = fake.returns([
            createFakeDiagnostic({
                sourceFile: createFakeSourceFile({ filePath: '/node_modules/pkg/nested/index.d.ts', line: 7 }),
                start: 42,
                code: 2305,
                messageText: 'Module has no exported member'
            })
        ]);
        const TSMorphProject = createFakeProjectConstructor({ getPreEmitDiagnostics });

        const diagnostics = firstProject(declarationProjectsFor(TSMorphProject)).listDiagnostics();

        assert.deepStrictEqual(diagnostics, [
            {
                declarationPath: 'nested/index.d.ts',
                line: 7,
                code: 2305,
                message: 'Module has no exported member'
            }
        ]);
    });

    test('listDiagnostics() flattens nested diagnostic message chains', function () {
        const getPreEmitDiagnostics = fake.returns([
            createFakeDiagnostic({
                sourceFile: createFakeSourceFile({}),
                start: 0,
                code: 2430,
                messageText: {
                    messageText: 'Interface incorrectly extends interface',
                    next: [ { messageText: 'Types of property are incompatible' } ]
                }
            })
        ]);
        const TSMorphProject = createFakeProjectConstructor({ getPreEmitDiagnostics });

        const diagnostics = firstProject(declarationProjectsFor(TSMorphProject)).listDiagnostics();

        assert.deepStrictEqual(
            diagnostics.map(function (diagnostic) {
                return diagnostic.message;
            }),
            [ 'Interface incorrectly extends interface\n  Types of property are incompatible' ]
        );
    });

    test('listDiagnostics() drops diagnostics without a location', function () {
        const getPreEmitDiagnostics = fake.returns([
            createFakeDiagnostic({ sourceFile: undefined, start: 0, code: 2305, messageText: 'no source file' }),
            createFakeDiagnostic({
                sourceFile: createFakeSourceFile({}),
                start: undefined,
                code: 2305,
                messageText: 'no start position'
            })
        ]);
        const TSMorphProject = createFakeProjectConstructor({ getPreEmitDiagnostics });

        const diagnostics = firstProject(declarationProjectsFor(TSMorphProject)).listDiagnostics();

        assert.deepStrictEqual(diagnostics, []);
    });
});
