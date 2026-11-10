import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveLocalConstruction } from './construction-target.ts';

suite('construction target order', function () {
    for (
        const [ content, expected ] of [
            [ 'class Local{};const result=new Local();export{};', { definition: undefined, arguments: [] } ],
            [ 'const Local=(class {});const result=new Local();export{};', { definition: undefined, arguments: [] } ],
            [ 'class Local{};Local=unknown;const result=new Local();export{};', undefined ],
            [ 'class Local{};const result=new Local(...items);export{};', undefined ],
            [ 'class Local{};const result=new Local();eval("Local=unknown");export{};', undefined ],
            [ 'class Local{};const result=new Local();', undefined ],
            [ 'const Local;const result=new Local();export{};', undefined ],
            [ 'let Local;const result=new Local();export{};', undefined ],
            [ 'const result=new Missing();export{};', undefined ],
            [ 'const result=new (unknown.Member)();export{};', undefined ],
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
