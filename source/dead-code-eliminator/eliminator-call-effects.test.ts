import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Node as TypeScriptMorphNode, SyntaxKind, type SourceFile } from 'ts-morph';
import { callEffectCases, callEffectProgram, type CallEffectCase } from '../test-libraries/call-effect-cases.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { prepareStandaloneRuntimeSource } from '../test-libraries/standalone-runtime-source.ts';

function prepareCallEffects(input: CallEffectCase): SourceFile {
    const source = createProject().createSourceFile(input.targetFilePath, callEffectProgram(input));
    prepareStandaloneRuntimeSource(source);
    return source;
}

function assertRemainingCalls(source: SourceFile, input: CallEffectCase): void {
    const targets = source.getDescendantsOfKind(SyntaxKind.CallExpression).map(function (call) {
        return call.getExpression().getText();
    });
    assert.deepStrictEqual({
        named: targets
            .filter(function (target) {
                return /^\(*\s*pure\s*\)*$/u.test(target);
            })
            .length,
        inline: targets
            .filter(function (target) {
                return target.includes('=>') || /\bfunction\b/u.test(target);
            })
            .length
    }, { named: input.namedCalls, inline: input.inlineCalls });
}

suite('unused call effects', function () {
    for (const input of callEffectCases) {
        test(`preserves effects and removes only safe calls for ${input.name}`, function () {
            assertRemainingCalls(prepareCallEffects(input), input);
        });
    }

    for (
        const [ name, propertyName ] of [
            [ 'anonymous-class-argument', null ],
            [ 'class-property-argument', 'x' ]
        ] as const
    ) {
        test(`retains class-name inference for ${name}`, function () {
            const input = callEffectCases.find(function (candidate) {
                return candidate.name === name;
            });
            assertDefined(input);
            const definition = prepareCallEffects(input).getFirstDescendantByKindOrThrow(SyntaxKind.ClassExpression);
            const context = definition.getAncestors().find(function (ancestor) {
                return !TypeScriptMorphNode.isParenthesizedExpression(ancestor);
            });
            assertDefined(context);
            if (propertyName === null) {
                assert.strictEqual(TypeScriptMorphNode.isVariableDeclaration(context), false);
                assert.strictEqual(TypeScriptMorphNode.isPropertyAssignment(context), false);
            } else {
                assert.strictEqual(context.asKindOrThrow(SyntaxKind.PropertyAssignment).getName(), propertyName);
            }
        });
    }
});
