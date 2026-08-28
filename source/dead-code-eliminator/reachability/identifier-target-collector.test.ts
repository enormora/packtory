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
        idsByFileAndName: new Map()
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
        idsByFileAndName: new Map()
    };
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
            ])
        });

        assert.deepStrictEqual(targets, new Set([ '/external.ts::x' ]));
    });

    test('collectIdentifierTargets maps named import specifiers to relative runtime exports', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: '/src/index.js',
                    content: 'import { config as localConfig } from "./shared.js";\nconst api = localConfig;'
                }
            ]
        });
        const sourceFile = project.getSourceFileOrThrow('/src/index.js');
        const importSpecifier = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
        const targets = collectIdentifierTargets(importSpecifier, {
            idsByNode: new Map(),
            idsByFileAndName: new Map([
                [ '/src/shared.js', new Map([ [ 'config', [ '/src/shared.js::config' ] ] ]) ]
            ])
        });

        assert.deepStrictEqual(targets, new Set([ '/src/shared.js::config' ]));
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
            idsByFileAndName: new Map([ [ '/src/shared', new Map([ [ 'config', [ '/src/shared::config' ] ] ]) ] ])
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
        const targets = collectIdentifierTargets(importSpecifier, {
            idsByNode: new Map(),
            idsByFileAndName: new Map()
        });

        assert.deepStrictEqual(targets, new Set());
    });
});
