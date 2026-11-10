import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createSourcePreparation, type SourcePreparation } from './source-preparation.ts';
import type { SourceTextEdit } from './text-edits.ts';

function prepareMixedExpression(content: string): SourcePreparation {
    const sourceFile = createProject().createSourceFile('index.ts', content);
    const preparation = createSourcePreparation(sourceFile);
    preparation.applyEdits([ {
        start: content.indexOf('const result'),
        end: content.indexOf('target'),
        content: 'void\n'
    } ]);
    return preparation;
}

function prepareGeneratedDeclaration(): SourcePreparation {
    const content = 'const old=\n 1;\n\nconst tail=3;';
    const preparation = createSourcePreparation(createProject().createSourceFile('index.ts', content));
    preparation.applyEdits([ { start: 0, end: content.indexOf('const tail'), content: 'const added=1;\n' } ]);
    return preparation;
}

function replaceGeneratedExpression(preparation: SourcePreparation, precedingEdits: readonly SourceTextEdit[]): void {
    const expression = preparation.sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.VoidExpression);
    preparation.applyEdits([
        ...precedingEdits,
        { start: expression.getStart(), end: expression.getEnd(), content: '42' }
    ]);
}

function assertOriginalExpressionLine(preparation: SourcePreparation, expected: number): void {
    const statement = preparation.sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ExpressionStatement);
    assert.strictEqual(preparation.originalLineFor(statement.getExpression()), expected);
}

suite('source preparation', function () {
    test('preserves identity locations without recording empty edits', function () {
        const sourceFile = createProject().createSourceFile('index.ts', 'const first = 1;\nconst second = 2;');
        const preparation = createSourcePreparation(sourceFile);
        preparation.applyEdits([]);
        assert.strictEqual(preparation.originalLineFor(sourceFile.getVariableDeclarationOrThrow('second')), 2);
        assert.strictEqual(preparation.transformations.length, 0);
    });

    test('projects generated replacements through earlier deletions', function () {
        const content = 'const dropped = 0;\nexport const value = 1;\nexport const tail = 9;';
        const sourceFile = createProject().createSourceFile('index.ts', content);
        const preparation = createSourcePreparation(sourceFile);
        preparation.applyEdits([ { start: 0, end: content.indexOf('export'), content: '' } ]);
        const initializer = sourceFile.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
        preparation.applyEdits([ { start: initializer.getStart(), end: initializer.getEnd(), content: '1000' } ]);
        assert.strictEqual(
            preparation.originalLineFor(sourceFile.getVariableDeclarationOrThrow('value').getInitializerOrThrow()),
            2
        );
        assert.strictEqual(preparation.originalLineFor(sourceFile.getVariableDeclarationOrThrow('tail')), 3);
        assert.deepStrictEqual(
            preparation.transformations.map(function ({ originalCode, transformedCode }) {
                return [ originalCode, transformedCode ];
            }),
            [
                [ content, 'export const value = 1;\nexport const tail = 9;' ],
                [
                    'export const value = 1;\nexport const tail = 9;',
                    'export const value = 1000;\nexport const tail = 9;'
                ]
            ]
        );
    });

    test('anchors inserted code in an empty source', function () {
        const sourceFile = createProject().createSourceFile('index.ts', '');
        const preparation = createSourcePreparation(sourceFile);
        preparation.applyEdits([ { start: 0, end: 0, content: '\nconst added = 42;' } ]);
        assert.strictEqual(preparation.originalLineFor(sourceFile.getVariableDeclarationOrThrow('added')), 1);
    });

    test('preserves the original line of a retained empty syntax list', function () {
        const sourceFile = createProject().createSourceFile('index.ts', 'function keep()\n{\n}\nconst tail=3;');
        const preparation = createSourcePreparation(sourceFile);
        preparation.applyEdits([ { start: sourceFile.getEnd(), end: sourceFile.getEnd(), content: '\nexport {};' } ]);
        const syntaxList = sourceFile.getFunctionOrThrow('keep').getBodyOrThrow().getChildSyntaxListOrThrow();
        assert.strictEqual(preparation.originalLineFor(syntaxList), 2);
    });

    test('anchors an expression by its retained operand after two transformations', function () {
        const preparation = prepareMixedExpression('const keep=0;\nconst result=\n target();\nconst tail=3;');
        const { sourceFile } = preparation;
        preparation.applyEdits([ { start: sourceFile.getEnd(), end: sourceFile.getEnd(), content: '\nexport {};' } ]);
        assert.strictEqual(
            preparation.originalLineFor(sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.VoidExpression)),
            3
        );
    });

    test('anchors a generated declaration before the first retained source span', function () {
        const preparation = prepareGeneratedDeclaration();
        const { sourceFile } = preparation;
        preparation.applyEdits([ { start: 0, end: 0, content: 'const prefix=0;\n' } ]);
        assert.strictEqual(
            preparation.originalLineFor(sourceFile.getVariableDeclarationOrThrow('added').getNameNode()),
            1
        );
    });

    test('anchors a renamed identifier before a retained source span', function () {
        const preparation = prepareGeneratedDeclaration();
        const { sourceFile } = preparation;
        const name = sourceFile.getVariableDeclarationOrThrow('added').getNameNode();
        preparation.applyEdits([ { start: name.getStart(), end: name.getEnd(), content: 'renamed' } ]);
        assert.strictEqual(
            preparation.originalLineFor(sourceFile.getVariableDeclarationOrThrow('renamed').getNameNode()),
            1
        );
    });

    for (
        const [ prefix, suffix, expected ] of [
            [ '', '', 2 ],
            [ '', '\nconst tail=3;', 2 ],
            [ 'const keep=0;\n', '', 3 ],
            [ 'const keep=0;\n', '\nconst tail=3;', 3 ]
        ] as const
    ) {
        test(`anchors a replaced expression between ${JSON.stringify([ prefix, suffix ])}`, function () {
            const preparation = prepareMixedExpression(`${prefix}const result=\n target();${suffix}`);
            replaceGeneratedExpression(preparation, []);
            assertOriginalExpressionLine(preparation, expected);
        });
    }

    test('projects a generated replacement through a simultaneous preceding deletion', function () {
        const preparation = prepareMixedExpression(
            'const dead=0;\nconst keep=0;\nconst result=\n target();\nconst tail=3;'
        );
        replaceGeneratedExpression(preparation, [
            { start: 0, end: preparation.sourceFile.getFullText().indexOf('const keep'), content: '' }
        ]);
        assertOriginalExpressionLine(preparation, 4);
    });
});
