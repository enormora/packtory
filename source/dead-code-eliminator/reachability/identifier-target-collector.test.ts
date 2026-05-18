import assert from 'node:assert';
import { SyntaxKind, type Node as TsMorphNode, type SourceFile } from 'ts-morph';
import { test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { collectIdentifierTargets, type DeclarationNodeIndex } from './identifier-target-collector.ts';

function rootSourceFile(content: string): SourceFile {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    return project.getSourceFileOrThrow('index.ts');
}

function indexedDeclaration(sourceFile: SourceFile, statementOffset: number, bindingId: string): DeclarationNodeIndex {
    const statement = sourceFile.getStatements()[statementOffset];
    if (statement === undefined) {
        throw new Error(`expected statement at offset ${statementOffset}`);
    }
    const declaration = statement.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
    return new Map<TsMorphNode, string>([[declaration, bindingId]]);
}

test('collectIdentifierTargets returns an empty set when the root has no identifiers', () => {
    assert.deepStrictEqual(collectIdentifierTargets(rootSourceFile(''), new Map()), new Set<string>());
});

test('collectIdentifierTargets returns an empty set when no identifier matches a known declaration', () => {
    const sourceFile = rootSourceFile('const x = 1;\nconsole.log(x);');

    assert.deepStrictEqual(collectIdentifierTargets(sourceFile, new Map()), new Set<string>());
});

test('collectIdentifierTargets maps each identifier symbol back to its declaration id when indexed', () => {
    const sourceFile = rootSourceFile('const x = 1;\nconst y = x;');
    const declarationIndex = indexedDeclaration(sourceFile, 0, '/index.ts::x');

    const targets = collectIdentifierTargets(sourceFile, declarationIndex);

    assert.strictEqual(targets.has('/index.ts::x'), true);
});

test('collectIdentifierTargets follows shorthand property assignments to the referenced symbol', () => {
    const sourceFile = rootSourceFile('const x = 1;\nconst obj = { x };');
    const declarationIndex = indexedDeclaration(sourceFile, 0, '/index.ts::x');
    const objStatement = sourceFile.getStatements()[1];
    if (objStatement === undefined) {
        assert.fail('expected obj declaration statement');
    }

    const targets = collectIdentifierTargets(objStatement, declarationIndex);

    assert.strictEqual(targets.has('/index.ts::x'), true);
});
