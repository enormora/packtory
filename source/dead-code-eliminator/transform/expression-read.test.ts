import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { expressionIsValueRead } from './expression-read.ts';
import { expressionIsWriteTarget } from './expression-write.ts';

suite('expression value reads', function () {
    test('keeps source files outside assignment targets', function () {
        const source = createProject().createSourceFile('input.ts', 'const value=1;');
        assert.strictEqual(expressionIsWriteTarget(source), false);
    });

    for (
        const [ content, expected ] of [
            [ 'target=1;', true ],
            [ 'target+=1;', true ],
            [ 'target^=1;', true ],
            [ 'target+1;', false ],
            [ '++target;', true ],
            [ '--target;', true ],
            [ '!target;', false ],
            [ 'target++;', true ],
            [ 'target--;', true ],
            [ 'for(target of values){}', true ],
            [ 'for(target in object){}', true ],
            [ 'for(const value of target){}', false ],
            [ '[target]=values;', true ],
            [ '({...target}=value);', true ],
            [ 'const value={key:target};', false ],
            [ '(target).value=1;', false ],
            [ 'call(target);', false ]
        ] as const
    ) {
        test(`classifies the write target in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const target = source.getDescendantsOfKind(SyntaxKind.Identifier).find(function (candidate) {
                return candidate.getText() === 'target';
            });
            assertDefined(target);
            assert.strictEqual(expressionIsWriteTarget(target), expected);
        });
    }

    test('distinguishes destructuring property names from assigned values', function () {
        const source = createProject().createSourceFile('input.ts', '({key:target}=value);');
        const property = source.getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAssignment);
        assert.strictEqual(expressionIsWriteTarget(property.getNameNode()), false);
        assert.strictEqual(expressionIsWriteTarget(property.getInitializerOrThrow()), true);
    });

    for (
        const [ content, kind, text, expected ] of [
            [ 'const object={key:42};', SyntaxKind.Identifier, 'key', false ],
            [ 'const object={1:42};', SyntaxKind.NumericLiteral, '1', false ],
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
