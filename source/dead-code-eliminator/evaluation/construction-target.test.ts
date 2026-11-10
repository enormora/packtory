import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveLocalConstruction } from './construction-target.ts';

suite('construction target order', function () {
    for (
        const [ content, expected ] of [
            [ 'class Local{};const result=new Local();export{};', { definition: undefined, arguments: [] } ],
            [ 'class Local{static value=new Local();}export{};', undefined ],
            [ 'const result=new Local();class Local{};export{};', undefined ]
        ] as const
    ) {
        test(`checks declaration order in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.NewExpression);
            assert.deepStrictEqual(resolveLocalConstruction(expression), expected);
        });
    }
});
