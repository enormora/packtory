import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';

suite('construction value specialization', function () {
    for (
        const [ expression, expected ] of [
            [ 'typeof new Empty()', '"object"' ],
            [ '!new Empty()', 'false' ],
            [ '!!new Empty()', 'true' ],
            [ 'new Empty() === new Empty()', 'false' ],
            [ 'new Empty() !== new Empty()', 'true' ]
        ]
    ) {
        test(`specializes the public value of ${expression}`, async function () {
            const fixture = singleFileOracleCase(
                `class Empty{}export const value=${expression};export function probe(){return value;}`,
                'index.js'
            );
            await assertDeadCodeEliminationEquivalent(fixture);
            const [ output ] = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            assertDefined(output);
            const content = output
                .contents
                .map(function (resource) {
                    return resource.fileDescription.content;
                })
                .join('\n');
            const source = createProject().createSourceFile('output.js', content);
            assert.strictEqual(source.getClasses().length, 0);
            assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.NewExpression).length, 0);
            assert.strictEqual(
                source.getVariableDeclarationOrThrow('value').getInitializerOrThrow().getText(),
                `(${expected})`
            );
        });
    }
    for (
        const content of [
            'class Empty{constructor(){console.log("constructed");}}export const value=typeof new Empty();',
            'class Empty{field=console.log("field");}export const value=!new Empty();',
            'class Empty{}export const value=typeof new Empty(console.log("argument"));',
            'class Empty{}export const value=typeof new Empty(missing);',
            'export const value=typeof new Empty();class Empty{}',
            'class Empty{valueOf(){console.log("conversion");return 42;}}export const value=+new Empty();'
        ]
    ) {
        test(`preserves observable construction in ${content}`, async function () {
            const fixture = singleFileOracleCase(`${content}export function probe(){return value;}`, 'index.js');
            await assertDeadCodeEliminationEquivalent(fixture);
            const [ output ] = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            assertDefined(output);
            const remaining = output.contents.reduce(function (count, resource) {
                const source = createProject().createSourceFile('output.js', resource.fileDescription.content);
                return count + source.getDescendantsOfKind(SyntaxKind.NewExpression).length;
            }, 0);
            assert.strictEqual(remaining, 1);
        });
    }
});
