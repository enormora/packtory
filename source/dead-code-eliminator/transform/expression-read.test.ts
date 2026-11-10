import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { expressionIsValueRead } from './expression-read.ts';

suite('expression value reads', function () {
    for (
        const [ content, kind, text, expected ] of [
            [ 'const result=object.field;', SyntaxKind.Identifier, 'field', false ],
            [ 'const result=object.field;', SyntaxKind.Identifier, 'object', true ],
            [ 'const result=()=>42;', SyntaxKind.NumericLiteral, '42', true ],
            [ 'type Result={[object.field]:number};', SyntaxKind.PropertyAccessExpression, 'object.field', false ],
            [ 'const result=tag`plain`;', SyntaxKind.Identifier, 'tag', false ],
            [ 'const result=tag`plain`;', SyntaxKind.NoSubstitutionTemplateLiteral, '`plain`', false ]
        ] as const
    ) {
        test(`classifies ${text} in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const expression = source.getDescendantsOfKind(kind).find(function (candidate) {
                return candidate.getText() === text;
            });
            assertDefined(expression);
            assert.strictEqual(expressionIsValueRead(expression), expected);
        });
    }
});
