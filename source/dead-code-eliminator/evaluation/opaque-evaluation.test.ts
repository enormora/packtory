import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { establishEvaluationEnvironment } from './evaluation-environment-establishment.ts';
import { evaluated, type EvaluatedValue } from './primitive-value.ts';

type OpaqueCase = {
    readonly content: string;
    readonly discardable: boolean;
    readonly result: EvaluatedValue | undefined;
};

function assertOpaqueEvaluation(input: OpaqueCase): void {
    const source = createProject().createSourceFile('input.js', `${input.content}\nexport {};`);
    const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    const evaluation = createSourceEvaluation(source);
    assert.strictEqual(evaluation.canDiscard(expression), input.discardable);
    assert.deepStrictEqual(evaluation.primitiveValue(expression), input.result);
}

const leafCases: readonly OpaqueCase[] = [
    {
        content: 'const base = { value: 1 };\nconst value = { ...base, get size() { return 1; } };',
        discardable: true,
        result: undefined
    },
    { content: 'const value = { ...{ get size() { return 1; } } };', discardable: false, result: undefined },
    { content: 'const value = function () {};', discardable: true, result: undefined },
    { content: 'const value = () => 1;', discardable: true, result: undefined },
    { content: 'const value = /x/;', discardable: true, result: undefined },
    { content: 'const value = typeof (() => 1);', discardable: true, result: undefined },
    { content: 'const value = !/x/;', discardable: true, result: undefined },
    { content: 'const value = -/x/;', discardable: false, result: undefined },
    { content: 'const value = -(typeof /x/);', discardable: true, result: undefined },
    { content: 'const value = /x/ === /x/;', discardable: true, result: undefined },
    { content: 'const value = (typeof /x/) + 1;', discardable: true, result: undefined },
    { content: 'const value = /x/ + 1;', discardable: false, result: undefined },
    { content: 'const value = /x/ in {};', discardable: false, result: undefined }
];

const templateCases: readonly OpaqueCase[] = [
    // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
    { content: 'const value = `a${1}b${"c"}`;', discardable: true, result: evaluated('a1bc') },
    // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
    { content: 'const value = `a${typeof /x/}`;', discardable: true, result: undefined },
    // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
    { content: 'const value = `a${/x/}`;', discardable: false, result: undefined },
    // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
    { content: 'const value = `${compute()}${1}`;', discardable: false, result: undefined }
];

const conditionCases: readonly OpaqueCase[] = [
    { content: 'const value = /x/ && 1;', discardable: true, result: undefined },
    { content: 'const value = /x/ ?? 1;', discardable: true, result: undefined },
    { content: 'const value = (typeof /x/) || 1;', discardable: true, result: undefined },
    { content: 'let other;\nconst value = /x/ && (other = 1);', discardable: false, result: undefined },
    { content: 'function f() { return 1; }\nconst value = /x/ || f();', discardable: false, result: undefined },
    { content: 'const value = /x/ ? 1 : 2;', discardable: false, result: undefined },
    { content: 'let other = 0;\nconst value = /x/ && other++;', discardable: false, result: undefined },
    { content: 'const other = 0;\nconst value = /x/ && -other;', discardable: true, result: undefined },
    { content: 'const value = /x/ || Symbol("a");', discardable: false, result: undefined },
    { content: 'const value = /x/ || Symbol(compute());', discardable: false, result: undefined },
    {
        content: 'function probe() { let a = /x/; a ||= 1; return 1; }\nconst value = probe();',
        discardable: false,
        result: undefined
    },
    {
        content: 'function probe() { let a = 0; a ||= 1; return a; }\nconst value = probe();',
        discardable: true,
        result: evaluated(1)
    },
    {
        content: 'function probe() { if (/x/) { return 1; } return 2; }\nconst value = probe();',
        discardable: false,
        result: undefined
    },
    {
        content: 'function probe() { while (/x/) { return 1; } return 2; }\nconst value = probe();',
        discardable: false,
        result: undefined
    }
];

suite('opaque evaluation', function () {
    suite('opaque leaves and operators', function () {
        for (const input of leafCases) {
            test(`evaluates ${input.content}`, function () {
                assertOpaqueEvaluation(input);
            });
        }
    });

    suite('templates', function () {
        for (const input of templateCases) {
            test(`evaluates ${input.content}`, function () {
                assertOpaqueEvaluation(input);
            });
        }
    });

    suite('unknown conditions', function () {
        test('evaluates a built-in call on the right of an unknown condition', function () {
            const source = createProject().createSourceFile(
                'input.js',
                'const value = /x/ || Symbol("a");\nexport {};'
            );
            establishEvaluationEnvironment([ source ], undefined, resolveRuntimeModule);
            const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();

            assert.strictEqual(createSourceEvaluation(source).canDiscard(expression), true);
        });

        for (const input of conditionCases) {
            test(`evaluates ${input.content}`, function () {
                assertOpaqueEvaluation(input);
            });
        }
    });
});
