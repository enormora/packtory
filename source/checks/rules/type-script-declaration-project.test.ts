import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, stub, type SinonSpy, type SinonStub } from 'sinon';
import { ModuleKind, ModuleResolutionKind, ScriptKind, ScriptTarget } from 'ts-morph';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import {
    createDeclarationProjectFactory,
    type DeclarationProject,
    type DeclarationProjectDependencies,
    type ResolutionPackageFiles
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
    const {
        filePath = '/workspace/.packtory-type-integrity/node_modules/pkg/index.d.ts',
        imports = [],
        exports = [],
        line = 1
    } = overrides;
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
    packageFiles: readonly { readonly filePath: string; readonly content: string; }[] = [],
    resolutionPackages: readonly ResolutionPackageFiles[] = []
): readonly DeclarationProject[] {
    const fileSystemHost = {};
    const fakeDependencies = {
        Project: projectConstructor,
        fileSystemHost,
        packageResolutionBaseFolder: '/workspace'
    } as unknown as DeclarationProjectDependencies;
    return createDeclarationProjectFactory(fakeDependencies)('pkg', packageFiles, resolutionPackages);
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

const consumerEntrypointFilePath =
    '/workspace/.packtory-type-integrity/node_modules/pkg/.packtory-consumer-entrypoints.ts';
const javaScriptImportFilePath = '/workspace/.packtory-type-integrity/node_modules/pkg/.packtory-javascript-imports.ts';

function createdSourceFiles(createSourceFile: SinonSpy, expectedFilePath: string): readonly unknown[][] {
    return createSourceFile.args.filter(function ([ filePath ]) {
        return filePath === expectedFilePath;
    });
}

function assertConsumerEntrypointSources(createSourceFile: SinonSpy, sources: readonly string[]): void {
    assert.deepStrictEqual(
        createdSourceFiles(createSourceFile, consumerEntrypointFilePath),
        sources.flatMap(function (source) {
            return [
                [ consumerEntrypointFilePath, source ],
                [ consumerEntrypointFilePath, source ]
            ];
        })
    );
}

function assertJavaScriptImportSources(createSourceFile: SinonSpy, sources: readonly string[]): void {
    assert.deepStrictEqual(
        createdSourceFiles(createSourceFile, javaScriptImportFilePath),
        sources.flatMap(function (source) {
            return [
                [ javaScriptImportFilePath, source ],
                [ javaScriptImportFilePath, source ]
            ];
        })
    );
}

suite('type-script-declaration-project', function () {
    test('creates one project per checked compiler mode', function () {
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
                        fileSystem: {},
                        skipAddingFilesFromTsConfig: true,
                        compilerOptions: {
                            module: ModuleKind.Node16,
                            moduleResolution: ModuleResolutionKind.Node16,
                            resolveJsonModule: true,
                            ...commonCompilerOptions
                        }
                    }
                ]
            },
            secondCall: {
                args: [
                    {
                        fileSystem: {},
                        skipAddingFilesFromTsConfig: true,
                        compilerOptions: {
                            module: ModuleKind.ESNext,
                            moduleResolution: ModuleResolutionKind.Bundler,
                            resolveJsonModule: true,
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
            [
                '/workspace/.packtory-type-integrity/node_modules/pkg/package.json',
                '{}',
                { scriptKind: ScriptKind.JSON }
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/pkg/nested/index.d.ts',
                'export declare const value: number;'
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/pkg/package.json',
                '{}',
                { scriptKind: ScriptKind.JSON }
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/pkg/nested/index.d.ts',
                'export declare const value: number;'
            ]
        ]);
    });

    test('adds resolution package files below their installed package folders', function () {
        const createSourceFile = fake();
        const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

        declarationProjectsFor(
            TSMorphProject,
            [ { filePath: 'package.json', content: '{"name":"pkg"}' } ],
            [
                {
                    packageName: '@scope/dependency',
                    packageFiles: [
                        { filePath: 'package.json', content: '{"name":"@scope/dependency"}' },
                        { filePath: 'lib/index.d.ts', content: 'export type Dependency = string;' }
                    ]
                }
            ]
        );

        assert.deepStrictEqual(createSourceFile.args, [
            [
                '/workspace/.packtory-type-integrity/node_modules/pkg/package.json',
                '{"name":"pkg"}',
                { scriptKind: ScriptKind.JSON }
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/@scope/dependency/package.json',
                '{"name":"@scope/dependency"}',
                { scriptKind: ScriptKind.JSON }
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/@scope/dependency/lib/index.d.ts',
                'export type Dependency = string;'
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/pkg/package.json',
                '{"name":"pkg"}',
                { scriptKind: ScriptKind.JSON }
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/@scope/dependency/package.json',
                '{"name":"@scope/dependency"}',
                { scriptKind: ScriptKind.JSON }
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/@scope/dependency/lib/index.d.ts',
                'export type Dependency = string;'
            ]
        ]);
    });

    test('adds each virtual package file once per project', function () {
        const createSourceFile = fake();
        const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

        declarationProjectsFor(
            TSMorphProject,
            [
                { filePath: 'package.json', content: '{"name":"pkg"}' },
                { filePath: 'package.json', content: '{"name":"pkg"}' }
            ]
        );

        assert.deepStrictEqual(createSourceFile.args, [
            [
                '/workspace/.packtory-type-integrity/node_modules/pkg/package.json',
                '{"name":"pkg"}',
                { scriptKind: ScriptKind.JSON }
            ],
            [
                '/workspace/.packtory-type-integrity/node_modules/pkg/package.json',
                '{"name":"pkg"}',
                { scriptKind: ScriptKind.JSON }
            ]
        ]);
    });

    suite('public consumer entrypoints', function () {
        test('adds a public consumer import file for root package types', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            const projects = declarationProjectsFor(TSMorphProject, [
                { filePath: 'package.json', content: '{"types":"./index.d.ts"}' },
                { filePath: 'index.d.ts', content: 'export declare const value: number;' }
            ]);

            assert.deepStrictEqual(firstProject(projects).publicEntrypointPaths, [
                '.packtory-consumer-entrypoints.ts'
            ]);
            assertConsumerEntrypointSources(createSourceFile, [ 'import "pkg";\n' ]);
        });

        test('adds public consumer imports for explicit package exports', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            declarationProjectsFor(TSMorphProject, [
                {
                    filePath: 'package.json',
                    content: JSON.stringify({
                        exports: {
                            '.': { types: './index.d.ts', import: './index.js' },
                            './feature.js': { types: './feature.d.ts', import: './feature.js' },
                            './private/*.js': { types: './private/*.d.ts', import: './private/*.js' },
                            './blocked.js': null
                        }
                    })
                }
            ]);

            assertConsumerEntrypointSources(createSourceFile, [
                [
                    'import "pkg";',
                    'import "pkg/feature.js";',
                    ''
                ]
                    .join('\n')
            ]);
        });

        test('adds a public consumer import file for string package exports', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            declarationProjectsFor(TSMorphProject, [
                { filePath: 'package.json', content: '{"exports":"./index.js"}' }
            ]);

            assertConsumerEntrypointSources(createSourceFile, [ 'import "pkg";\n' ]);
        });

        test('adds a public consumer import file for array package exports', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            declarationProjectsFor(TSMorphProject, [
                { filePath: 'package.json', content: '{"exports":["./index.js"]}' }
            ]);

            assertConsumerEntrypointSources(createSourceFile, [ 'import "pkg";\n' ]);
        });

        test('adds a public consumer import file for conditional root exports', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            declarationProjectsFor(TSMorphProject, [
                { filePath: 'package.json', content: '{"exports":{"types":"./index.d.ts","import":"./index.js"}}' }
            ]);

            assertConsumerEntrypointSources(createSourceFile, [ 'import "pkg";\n' ]);
        });

        test('adds public consumer imports for each legacy package root field', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            declarationProjectsFor(TSMorphProject, [
                { filePath: 'package.json', content: '{"typings":"./index.d.ts"}' }
            ]);
            declarationProjectsFor(TSMorphProject, [
                { filePath: 'package.json', content: '{"main":"./index.js"}' }
            ]);

            assertConsumerEntrypointSources(createSourceFile, [
                'import "pkg";\n',
                'import "pkg";\n'
            ]);
        });

        test('finds the manifest by file name', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            declarationProjectsFor(TSMorphProject, [
                { filePath: 'index.d.ts', content: 'export declare const value: number;' },
                { filePath: 'nested/package.json', content: '{"types":"./wrong.d.ts"}' },
                { filePath: 'package.json', content: '{"types":"./index.d.ts"}' }
            ]);

            assertConsumerEntrypointSources(createSourceFile, [ 'import "pkg";\n' ]);
        });

        test('does not add a public consumer import file without public entrypoints', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            const checkedProjects = [
                declarationProjectsFor(TSMorphProject, []),
                declarationProjectsFor(TSMorphProject, [ { filePath: 'package.json', content: 'null' } ]),
                declarationProjectsFor(TSMorphProject, [ { filePath: 'package.json', content: '{"exports":{}}' } ]),
                declarationProjectsFor(TSMorphProject, [
                    { filePath: 'package.json', content: '{"exports":{".":null,"./blocked.js":null}}' }
                ]),
                declarationProjectsFor(TSMorphProject, [
                    {
                        filePath: 'package.json',
                        content: '{"exports":{"import":"./index.js","./private/*.js":"./private/*.js"}}'
                    }
                ])
            ];

            assert.deepStrictEqual(
                checkedProjects.map(function (projects) {
                    return firstProject(projects).publicEntrypointPaths;
                }),
                [ [], [], [], [], [] ]
            );
            assert.deepStrictEqual(createdSourceFiles(createSourceFile, consumerEntrypointFilePath), []);
        });

        test('adds public consumer imports for package specifiers used by JavaScript files', function () {
            const createSourceFile = fake();
            const TSMorphProject = createFakeProjectConstructor({ createSourceFile });

            const projects = declarationProjectsFor(TSMorphProject, [
                { filePath: 'package.json', content: '{"types":"./index.d.ts"}' },
                {
                    filePath: 'index.js',
                    content: [
                        'import "@scope/core/public.js";',
                        'import "@scope/core/public.js";',
                        'import "./local.js";',
                        'import "../parent.js";',
                        'import "/absolute.js";',
                        'import "#internal";',
                        'import "node:path";',
                        'export { value } from "dependency";',
                        'export const value = 1;'
                    ]
                        .join('\n')
                },
                { filePath: 'index.d.ts', content: 'import "declaration-only";\n' },
                { filePath: 'index.js.map', content: 'import "source-map-only";\n' }
            ]);

            assert.deepStrictEqual(firstProject(projects).publicEntrypointPaths, [
                '.packtory-consumer-entrypoints.ts',
                '.packtory-javascript-imports.ts'
            ]);
            assertJavaScriptImportSources(createSourceFile, [
                [
                    'import "@scope/core/public.js";',
                    'import "dependency";',
                    ''
                ]
                    .join('\n')
            ]);
        });
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
        assert.deepStrictEqual(getSourceFileOrThrow.args, [
            [ '/workspace/.packtory-type-integrity/node_modules/pkg/nested/index.d.ts' ]
        ]);
    });

    test('listDiagnostics() reports package-relative paths, lines, codes and messages', function () {
        const getPreEmitDiagnostics = fake.returns([
            createFakeDiagnostic({
                sourceFile: createFakeSourceFile({
                    filePath: '/workspace/.packtory-type-integrity/node_modules/pkg/nested/index.d.ts',
                    line: 7
                }),
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
