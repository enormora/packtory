import assert from 'node:assert';
import { SyntaxKind, type Node as TsMorphNode, type SourceFile } from 'ts-morph';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { collectIdentifierTargets, type DeclarationNodeIndex } from './identifier-target-collector.ts';

function rootSourceFile(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    return project.getSourceFileOrThrow('index.ts');
}

function emptyIndex(): DeclarationNodeIndex {
    return {
        idsByNode: new Map(),
        idsByFileAndName: new Map(),
        idsByTargetFileAndName: new Map(),
        moduleReferencesByTargetFilePath: new Map(),
        targetFilePathByInputFilePath: new Map()
    };
}

function indexedDeclaration(sourceFile: SourceFile, statementOffset: number, bindingId: string): DeclarationNodeIndex {
    const statement = sourceFile.getStatements()[statementOffset];
    if (statement === undefined) {
        throw new Error(`expected statement at offset ${statementOffset}`);
    }
    const declaration = statement.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
    return {
        idsByNode: new Map<TsMorphNode, readonly string[]>([ [ declaration, [ bindingId ] ] ]),
        idsByFileAndName: new Map(),
        idsByTargetFileAndName: new Map(),
        moduleReferencesByTargetFilePath: new Map(),
        targetFilePathByInputFilePath: new Map()
    };
}

function collectImportTargets(content: string, declarationIndex: DeclarationNodeIndex): Set<string> {
    const project = createProject({ withFiles: [ { filePath: '/src/index.js', content } ] });
    const sourceFile = project.getSourceFileOrThrow('/src/index.js');
    const importSpecifier = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
    return collectIdentifierTargets(importSpecifier, declarationIndex);
}

function registerRelativeImportTests(): void {
    test('collectIdentifierTargets maps named import specifiers to relative runtime exports', function () {
        const targets = collectImportTargets(
            'import { config as localConfig } from "./shared.js";\nconst api = localConfig;',
            {
                idsByNode: new Map(),
                idsByFileAndName: new Map([
                    [ '/src/shared.js', new Map([ [ 'config', [ '/src/shared.js::config' ] ] ]) ]
                ]),
                idsByTargetFileAndName: new Map([
                    [ 'shared.js', new Map([ [ 'config', [ '/src/shared.js::config' ] ] ]) ]
                ]),
                moduleReferencesByTargetFilePath: new Map([
                    [
                        'index.js',
                        [
                            {
                                type: 'local-code',
                                sourceSpecifier: './wrong.js',
                                emittedSpecifier: './wrong.js',
                                targetFilePath: 'wrong.js'
                            },
                            {
                                type: 'local-code',
                                sourceSpecifier: './shared.js',
                                emittedSpecifier: './shared.js',
                                targetFilePath: 'shared.js'
                            }
                        ]
                    ]
                ]),
                targetFilePathByInputFilePath: new Map([ [ '/src/index.js', 'index.js' ] ])
            }
        );

        assert.deepStrictEqual(targets, new Set([ '/src/shared.js::config' ]));
    });

    test('collectIdentifierTargets does not map relative asset imports to exported bindings', function () {
        const targets = collectImportTargets('import { config } from "./config.json";\nconst api = config;', {
            idsByNode: new Map(),
            idsByFileAndName: new Map(),
            idsByTargetFileAndName: new Map([
                [ 'config.json', new Map([ [ 'config', [ 'config.json::config' ] ] ]) ]
            ]),
            moduleReferencesByTargetFilePath: new Map([
                [
                    'index.js',
                    [
                        {
                            type: 'local-asset',
                            sourceSpecifier: './config.json',
                            emittedSpecifier: './config.json',
                            targetFilePath: 'config.json'
                        }
                    ]
                ]
            ]),
            targetFilePathByInputFilePath: new Map([ [ '/src/index.js', 'index.js' ] ])
        });

        assert.deepStrictEqual(targets, new Set());
    });

    test('collectIdentifierTargets does not map relative imports with missing target exports', function () {
        const targets = collectImportTargets('import { config } from "./shared.js";\nconst api = config;', {
            idsByNode: new Map(),
            idsByFileAndName: new Map(),
            idsByTargetFileAndName: new Map(),
            moduleReferencesByTargetFilePath: new Map([
                [
                    'index.js',
                    [
                        {
                            type: 'local-code',
                            sourceSpecifier: './shared.js',
                            emittedSpecifier: './shared.js',
                            targetFilePath: 'shared.js'
                        }
                    ]
                ]
            ]),
            targetFilePathByInputFilePath: new Map([ [ '/src/index.js', 'index.js' ] ])
        });

        assert.deepStrictEqual(targets, new Set());
    });

    test('collectIdentifierTargets ignores relative imports when the importer has no target path', function () {
        const targets = collectImportTargets('import { config } from "./shared.js";\nconst api = config;', {
            idsByNode: new Map(),
            idsByFileAndName: new Map(),
            idsByTargetFileAndName: new Map([
                [ undefined as unknown as string, new Map([ [ 'config', [ 'missing-target::config' ] ] ]) ],
                [ 'shared.js', new Map([ [ 'config', [ 'shared.js::config' ] ] ]) ]
            ]),
            moduleReferencesByTargetFilePath: new Map([
                [
                    undefined as unknown as string,
                    [
                        {
                            type: 'local-code',
                            sourceSpecifier: './shared.js',
                            emittedSpecifier: './shared.js',
                            targetFilePath: 'shared.js'
                        }
                    ]
                ]
            ]),
            targetFilePathByInputFilePath: new Map()
        });

        assert.deepStrictEqual(targets, new Set());
    });
}

suite('identifier-target-collector', function () {
    test('collectIdentifierTargets returns an empty set when the root has no identifiers', function () {
        assert.deepStrictEqual(collectIdentifierTargets(rootSourceFile(''), emptyIndex()), new Set<string>());
    });

    test('collectIdentifierTargets returns an empty set when no identifier matches a known declaration', function () {
        const sourceFile = rootSourceFile('const x = 1;\nconsole.log(x);');

        assert.deepStrictEqual(collectIdentifierTargets(sourceFile, emptyIndex()), new Set<string>());
    });

    test('collectIdentifierTargets maps each identifier symbol back to its declaration id when indexed', function () {
        const sourceFile = rootSourceFile('const x = 1;\nconst y = x;');
        const declarationIndex = indexedDeclaration(sourceFile, 0, '/index.ts::x');

        const targets = collectIdentifierTargets(sourceFile, declarationIndex);

        assert.strictEqual(targets.has('/index.ts::x'), true);
    });

    test('collectIdentifierTargets follows shorthand property assignments to the referenced symbol', function () {
        const sourceFile = rootSourceFile('const x = 1;\nconst obj = { x };');
        const declarationIndex = indexedDeclaration(sourceFile, 0, '/index.ts::x');
        const objStatement = sourceFile.getStatements()[1];
        if (objStatement === undefined) {
            assert.fail('expected obj declaration statement');
        }

        const targets = collectIdentifierTargets(objStatement, declarationIndex);

        assert.strictEqual(targets.has('/index.ts::x'), true);
    });

    test('collectIdentifierTargets falls back to declaration path and binding name', function () {
        const sourceFile = rootSourceFile('const x = 1;\nconst y = x;');
        const statement = sourceFile.getVariableDeclarationOrThrow('y').getVariableStatementOrThrow();
        const targets = collectIdentifierTargets(statement, {
            idsByNode: new Map(),
            idsByFileAndName: new Map([
                [ sourceFile.getFilePath(), new Map([ [ 'x', [ '/external.ts::x' ] ] ]) ]
            ]),
            idsByTargetFileAndName: new Map(),
            moduleReferencesByTargetFilePath: new Map(),
            targetFilePathByInputFilePath: new Map()
        });

        assert.deepStrictEqual(targets, new Set([ '/external.ts::x' ]));
    });

    registerRelativeImportTests();

    test('collectIdentifierTargets maps emitted js imports to ts source identity exports by target path', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: '/source/file-manager/file-manager.ts',
                    content: 'import { isExecutableFileMode } from "./permissions.js";\n'
                }
            ]
        });
        const sourceFile = project.getSourceFileOrThrow('/source/file-manager/file-manager.ts');
        const importSpecifier = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
        const bindingIds = [ '/source/file-manager/permissions.ts::isExecutableFileMode' ];
        const declarationIndex: DeclarationNodeIndex = {
            idsByNode: new Map(),
            idsByFileAndName: new Map([
                [
                    '/source/file-manager/permissions.ts',
                    new Map([ [ 'isExecutableFileMode', bindingIds ] ])
                ]
            ]),
            idsByTargetFileAndName: new Map([
                [
                    'file-manager/permissions.js',
                    new Map([ [ 'isExecutableFileMode', bindingIds ] ])
                ]
            ]),
            moduleReferencesByTargetFilePath: new Map([
                [
                    'file-manager/file-manager.js',
                    [
                        {
                            type: 'local-code',
                            sourceSpecifier: './permissions',
                            emittedSpecifier: './permissions.js',
                            targetFilePath: 'file-manager/permissions.js'
                        }
                    ]
                ]
            ]),
            targetFilePathByInputFilePath: new Map([
                [ '/source/file-manager/file-manager.ts', 'file-manager/file-manager.js' ],
                [ '/source/file-manager/permissions.ts', 'file-manager/permissions.js' ]
            ])
        };
        const targets = collectIdentifierTargets(importSpecifier, declarationIndex);

        assert.deepStrictEqual(
            targets,
            new Set([ '/source/file-manager/permissions.ts::isExecutableFileMode' ])
        );
    });

    test('collectIdentifierTargets does not map named imports from external modules', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: '/src/index.js',
                    content: 'import { config } from "shared";\nconst api = config;'
                }
            ]
        });
        const sourceFile = project.getSourceFileOrThrow('/src/index.js');
        const importSpecifier = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
        const targets = collectIdentifierTargets(importSpecifier, {
            idsByNode: new Map(),
            idsByFileAndName: new Map([ [ '/src/shared', new Map([ [ 'config', [ '/src/shared::config' ] ] ]) ] ]),
            idsByTargetFileAndName: new Map(),
            moduleReferencesByTargetFilePath: new Map(),
            targetFilePathByInputFilePath: new Map()
        });

        assert.deepStrictEqual(targets, new Set());
    });

    test('collectIdentifierTargets does not map bare imports through malformed local references', function () {
        const targets = collectImportTargets('import { config } from "shared";\nconst api = config;', {
            idsByNode: new Map(),
            idsByFileAndName: new Map(),
            idsByTargetFileAndName: new Map([
                [ 'shared.js', new Map([ [ 'config', [ 'shared.js::config' ] ] ]) ]
            ]),
            moduleReferencesByTargetFilePath: new Map([
                [
                    'index.js',
                    [
                        {
                            type: 'local-code',
                            sourceSpecifier: 'shared',
                            emittedSpecifier: 'shared',
                            targetFilePath: 'shared.js'
                        }
                    ]
                ]
            ]),
            targetFilePathByInputFilePath: new Map([ [ '/src/index.js', 'index.js' ] ])
        });

        assert.deepStrictEqual(targets, new Set());
    });

    test('collectIdentifierTargets does not map missing relative runtime exports', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: '/src/index.js',
                    content: 'import { config } from "./missing.js";\nconst api = config;'
                }
            ]
        });
        const sourceFile = project.getSourceFileOrThrow('/src/index.js');
        const importSpecifier = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
        assert.throws(
            function () {
                collectIdentifierTargets(importSpecifier, {
                    idsByNode: new Map(),
                    idsByFileAndName: new Map(),
                    idsByTargetFileAndName: new Map(),
                    moduleReferencesByTargetFilePath: new Map(),
                    targetFilePathByInputFilePath: new Map([ [ '/src/index.js', 'index.js' ] ])
                });
            },
            {
                message: 'Missing resolved module reference for "./missing.js" in "index.js"'
            }
        );
    });
});
