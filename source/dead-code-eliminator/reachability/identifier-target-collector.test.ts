import assert from 'node:assert';
import { SyntaxKind, type Node as TypeScriptMorphNode, type SourceFile } from 'ts-morph';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { collectIdentifierTargets, type DeclarationNodeIndex } from './identifier-target-collector.ts';

function rootSourceFile(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    return project.getSourceFileOrThrow('index.ts');
}

function emptyIndex(): DeclarationNodeIndex {
    return {
        identifiersByNode: new Map(),
        identifiersByFileAndName: new Map(),
        identifiersByTargetFileAndName: new Map(),
        moduleReferencesByTargetFilePath: new Map(),
        targetFilePathByInputFilePath: new Map()
    };
}

function indexedDeclaration(
    sourceFile: SourceFile,
    statementOffset: number,
    bindingIdentifier: string
): DeclarationNodeIndex {
    const statement = sourceFile.getStatements()[statementOffset];
    if (statement === undefined) {
        throw new Error(`expected statement at offset ${statementOffset}`);
    }
    const declaration = statement.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
    return {
        identifiersByNode: new Map<TypeScriptMorphNode, readonly string[]>([ [ declaration, [ bindingIdentifier ] ] ]),
        identifiersByFileAndName: new Map(),
        identifiersByTargetFileAndName: new Map(),
        moduleReferencesByTargetFilePath: new Map(),
        targetFilePathByInputFilePath: new Map()
    };
}

function collectImportTargets(content: string, declarationIndex: DeclarationNodeIndex): Set<string> {
    const project = createProject({ withFiles: [ { filePath: '/source/index.js', content } ] });
    const sourceFile = project.getSourceFileOrThrow('/source/index.js');
    const importSpecifier = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
    return collectIdentifierTargets(importSpecifier, declarationIndex);
}

function registerRelativeImportTests(): void {
    test('collectIdentifierTargets maps named import specifiers to relative runtime exports', function () {
        const targets = collectImportTargets(
            'import { configuration as localConfig } from "./shared.js";\nconst api = localConfig;',
            {
                identifiersByNode: new Map(),
                identifiersByFileAndName: new Map([
                    [ '/source/shared.js', new Map([ [ 'configuration', [ '/source/shared.js::configuration' ] ] ]) ]
                ]),
                identifiersByTargetFileAndName: new Map([
                    [ 'shared.js', new Map([ [ 'configuration', [ '/source/shared.js::configuration' ] ] ]) ]
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
                targetFilePathByInputFilePath: new Map([ [ '/source/index.js', 'index.js' ] ])
            }
        );

        assert.deepStrictEqual(targets, new Set([ '/source/shared.js::configuration' ]));
    });

    test('collectIdentifierTargets does not map relative asset imports to exported bindings', function () {
        const targets = collectImportTargets(
            'import { configuration } from "./configuration.json";\nconst api = configuration;',
            {
                identifiersByNode: new Map(),
                identifiersByFileAndName: new Map(),
                identifiersByTargetFileAndName: new Map([
                    [ 'config.json', new Map([ [ 'configuration', [ 'config.json::configuration' ] ] ]) ]
                ]),
                moduleReferencesByTargetFilePath: new Map([
                    [
                        'index.js',
                        [
                            {
                                type: 'local-asset',
                                sourceSpecifier: './configuration.json',
                                emittedSpecifier: './configuration.json',
                                targetFilePath: 'config.json'
                            }
                        ]
                    ]
                ]),
                targetFilePathByInputFilePath: new Map([ [ '/source/index.js', 'index.js' ] ])
            }
        );

        assert.deepStrictEqual(targets, new Set());
    });

    test('collectIdentifierTargets does not map relative imports with missing target exports', function () {
        const targets = collectImportTargets(
            'import { configuration } from "./shared.js";\nconst api = configuration;',
            {
                identifiersByNode: new Map(),
                identifiersByFileAndName: new Map(),
                identifiersByTargetFileAndName: new Map(),
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
                targetFilePathByInputFilePath: new Map([ [ '/source/index.js', 'index.js' ] ])
            }
        );

        assert.deepStrictEqual(targets, new Set());
    });

    test('collectIdentifierTargets ignores relative imports when the importer has no target path', function () {
        const targets = collectImportTargets(
            'import { configuration } from "./shared.js";\nconst api = configuration;',
            {
                identifiersByNode: new Map(),
                identifiersByFileAndName: new Map(),
                identifiersByTargetFileAndName: new Map([
                    [
                        undefined as unknown as string,
                        new Map([ [ 'configuration', [ 'missing-target::configuration' ] ] ])
                    ],
                    [ 'shared.js', new Map([ [ 'configuration', [ 'shared.js::configuration' ] ] ]) ]
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
            }
        );

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
        const objectStatement = sourceFile.getStatements()[1];
        if (objectStatement === undefined) {
            assert.fail('expected obj declaration statement');
        }

        const targets = collectIdentifierTargets(objectStatement, declarationIndex);

        assert.strictEqual(targets.has('/index.ts::x'), true);
    });

    test('collectIdentifierTargets falls back to declaration path and binding name', function () {
        const sourceFile = rootSourceFile('const x = 1;\nconst y = x;');
        const statement = sourceFile.getVariableDeclarationOrThrow('y').getVariableStatementOrThrow();
        const targets = collectIdentifierTargets(statement, {
            identifiersByNode: new Map(),
            identifiersByFileAndName: new Map([
                [ sourceFile.getFilePath(), new Map([ [ 'x', [ '/external.ts::x' ] ] ]) ]
            ]),
            identifiersByTargetFileAndName: new Map(),
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
        const bindingIdentifiers = [ '/source/file-manager/permissions.ts::isExecutableFileMode' ];
        const declarationIndex: DeclarationNodeIndex = {
            identifiersByNode: new Map(),
            identifiersByFileAndName: new Map([
                [
                    '/source/file-manager/permissions.ts',
                    new Map([ [ 'isExecutableFileMode', bindingIdentifiers ] ])
                ]
            ]),
            identifiersByTargetFileAndName: new Map([
                [
                    'file-manager/permissions.js',
                    new Map([ [ 'isExecutableFileMode', bindingIdentifiers ] ])
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
                    filePath: '/source/index.js',
                    content: 'import { configuration } from "shared";\nconst api = configuration;'
                }
            ]
        });
        const sourceFile = project.getSourceFileOrThrow('/source/index.js');
        const importSpecifier = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
        const targets = collectIdentifierTargets(importSpecifier, {
            identifiersByNode: new Map(),
            identifiersByFileAndName: new Map([ [
                '/source/shared',
                new Map([ [ 'configuration', [ '/source/shared::configuration' ] ] ])
            ] ]),
            identifiersByTargetFileAndName: new Map(),
            moduleReferencesByTargetFilePath: new Map(),
            targetFilePathByInputFilePath: new Map()
        });

        assert.deepStrictEqual(targets, new Set());
    });

    test('collectIdentifierTargets does not map bare imports through malformed local references', function () {
        const targets = collectImportTargets('import { configuration } from "shared";\nconst api = configuration;', {
            identifiersByNode: new Map(),
            identifiersByFileAndName: new Map(),
            identifiersByTargetFileAndName: new Map([
                [ 'shared.js', new Map([ [ 'configuration', [ 'shared.js::configuration' ] ] ]) ]
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
            targetFilePathByInputFilePath: new Map([ [ '/source/index.js', 'index.js' ] ])
        });

        assert.deepStrictEqual(targets, new Set());
    });

    test('collectIdentifierTargets does not map missing relative runtime exports', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: '/source/index.js',
                    content: 'import { configuration } from "./missing.js";\nconst api = configuration;'
                }
            ]
        });
        const sourceFile = project.getSourceFileOrThrow('/source/index.js');
        const importSpecifier = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
        assert.throws(
            function () {
                collectIdentifierTargets(importSpecifier, {
                    identifiersByNode: new Map(),
                    identifiersByFileAndName: new Map(),
                    identifiersByTargetFileAndName: new Map(),
                    moduleReferencesByTargetFilePath: new Map(),
                    targetFilePathByInputFilePath: new Map([ [ '/source/index.js', 'index.js' ] ])
                });
            },
            {
                message: 'Missing resolved module reference for "./missing.js" in "index.js"'
            }
        );
    });
});
