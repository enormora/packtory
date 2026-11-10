import assert from 'node:assert';
import { oneLine } from 'common-tags';
import { suite, test } from 'mocha';
import {
    assertDeadCodeEliminationEquivalent,
    type DeadCodeEliminationOracleCase,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { bundleForCodeFile, inputs, inputWithoutTransformations } from '../test-libraries/eliminator-test-support.ts';
import {
    assertSingleFileEvaluation,
    type SingleFileEvaluationCase
} from '../test-libraries/dead-code-elimination-single-file-case.ts';
import type { AnalyzedBundle } from './analyzed-bundle.ts';

const evaluationGuards: readonly SingleFileEvaluationCase[] = [
    {
        name: 'folds unary plus on primitive strings',
        content: 'function compute(){return +"42";}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'folds unary minus on primitive strings',
        content: 'function compute(){return -"42";}export const value=compute();',
        result: { value: -42 },
        native: { error: null, value: -42 },
        remainingCalls: 0
    },
    {
        name: 'folds unary minus on booleans',
        content: 'function compute(){return -true;}export const value=compute();',
        result: { value: -1 },
        native: { error: null, value: -1 },
        remainingCalls: 0
    },
    {
        name: 'folds unary plus on null',
        content: 'function compute(){return +null;}export const value=compute();',
        result: { value: 0 },
        native: { error: null, value: 0 },
        remainingCalls: 0
    },
    {
        name: 'preserves signed zero when converting null',
        content: 'function compute(){return 1/(-null)<0;}export const value=compute();',
        result: { value: true },
        native: { error: null, value: true },
        remainingCalls: 0
    },
    {
        name: 'preserves NaN when converting undefined',
        content: 'function compute(){return (-undefined)!==(-undefined);}export const value=compute();',
        result: { value: true },
        native: { error: null, value: true },
        remainingCalls: 0
    },
    {
        name: 'retains unary plus BigInt errors',
        content: 'function compute(){return +1n;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'distinguishes greater than from equality',
        content: 'function compute(n){return n>n;}export const value=compute(1);',
        result: { value: false },
        native: { error: null, value: false },
        remainingCalls: 0
    },
    {
        name: 'retains null conversion on the left of concatenation',
        content: 'function compute(){return null+" value";}export const value=compute();',
        result: undefined,
        native: { error: null, value: 'null value' },
        remainingCalls: 1
    },
    {
        name: 'retains null conversion on the right of concatenation',
        content: 'function compute(){return "value "+null;}export const value=compute();',
        result: undefined,
        native: { error: null, value: 'value null' },
        remainingCalls: 1
    },
    {
        name: 'retains numeric conversion in string subtraction',
        content: 'function compute(){return "2"-"1";}export const value=compute();',
        result: undefined,
        native: { error: null, value: 1 },
        remainingCalls: 1
    },
    {
        name: 'retains unsupported numeric operations',
        content: 'function compute(){return 2**3;}export const value=compute();',
        result: undefined,
        native: { error: null, value: 8 },
        remainingCalls: 1
    },
    {
        name: 'retains unsupported unary operations',
        content: 'function compute(){return ~1;}export const value=compute();',
        result: undefined,
        native: { error: null, value: -2 },
        remainingCalls: 1
    },
    {
        name: 'selects nullish fallbacks for undefined',
        content: 'function compute(){return undefined??42;}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'retains unknown compound assignment operands',
        content: 'function compute(){let value=1;value+=missing;return value;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'ReferenceError' } },
        remainingCalls: 1
    },
    {
        name: 'retains failed postfix writes to constants',
        content: 'function compute(){const value=1;return value++;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'preserves return completion through a single loop iteration',
        content: 'function compute(){let index=0;for(;index<1;){index++;return 42;}return 7;}' +
            'export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'does not complete a reference after exhausting the evaluation budget',
        content: 'function compute(n){let value=0;for(let index=0;index<n;index++)value++;{}return ++value;}' +
            'export const value=compute(226);',
        result: undefined,
        native: { error: null, value: 227 },
        remainingCalls: 1
    },
    {
        name: 'retains unconsumed break errors',
        content: 'function compute(){break;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'SyntaxError' } },
        remainingCalls: 1
    },
    {
        name: 'retains unresolved break label errors',
        content: 'function compute(){while(true){break missing;}return 42;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'SyntaxError' } },
        remainingCalls: 1
    },
    {
        name: 'retains unresolved continue label errors',
        content: 'function compute(){let index=0;while(index<1){index++;continue missing;}return 42;}' +
            'export const value=compute();',
        result: undefined,
        native: { error: { name: 'SyntaxError' } },
        remainingCalls: 1
    },
    {
        name: 'retains resource initialization syntax errors',
        content: 'using resource;export const value=42;',
        result: { value: 42 },
        native: { error: { name: 'SyntaxError' } },
        remainingCalls: 0
    },
    {
        name: 'retains numeric coercion when incrementing a string binding',
        content: 'function compute(){let input="41";return ++input;}export const value=compute();',
        result: undefined,
        native: { error: null, value: 42 },
        remainingCalls: 1
    },
    {
        name: 'retains unknown conditional expression errors',
        content: 'function compute(){return missing?1:2;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'ReferenceError' } },
        remainingCalls: 1
    }
];

const stringLimitCases = [
    [ 'folds concatenation at the string limit', 2048, 2048, true ],
    [ 'retains concatenation beyond the string limit', 2048, 2049, false ]
] as const;

function emittedCode(bundles: readonly AnalyzedBundle[]): string {
    const contents: string[] = [];
    for (const bundle of bundles) {
        for (const resource of bundle.contents) {
            contents.push(resource.fileDescription.content);
        }
    }
    return contents.join('\n');
}

function evaluationCase(content: string): DeadCodeEliminationOracleCase {
    return {
        name: 'local-evaluation',
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
        eliminationInputs: inputs(bundleForCodeFile({
            name: 'package',
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js',
            content: `${content}\nexport function probe() { return 42; }`
        }))
    };
}

suite('local evaluation', function () {
    suite('evaluation guards', function () {
        for (const entry of evaluationGuards) {
            test(entry.name, async function () {
                await assertSingleFileEvaluation(entry);
            });
        }

        for (const [ name, leftLength, rightLength, folds ] of stringLimitCases) {
            test(name, async function () {
                const left = 'a'.repeat(leftLength);
                const right = 'b'.repeat(rightLength);
                await assertSingleFileEvaluation({
                    name,
                    content: `function compute(){return ${JSON.stringify(left)}+${JSON.stringify(right)};}` +
                        'export const value=compute();',
                    result: folds ? { value: left + right } : undefined,
                    native: { error: null, value: left + right },
                    remainingCalls: folds ? 0 : 1
                });
            });
        }
    });

    suite('controls', function () {
        for (
            const declaration of [
                'function compute() { return 1; } if (true) { function compute() { console.log("replacement"); } }',
                'if (false) { function compute() { return 1; } }'
            ]
        ) {
            test(`preserves conditional CommonJS declarations: ${declaration}`, async function () {
                await assertDeadCodeEliminationEquivalent({
                    name: 'conditional-commonjs',
                    entry: { bundleName: 'package', targetFilePath: 'index.cjs', exportName: 'default' },
                    eliminationInputs: inputs(bundleForCodeFile({
                        name: 'package',
                        inputFilePath: '/source/index.cjs',
                        targetFilePath: 'index.cjs',
                        content: `${declaration}\nconst unused = compute(); module.exports = () => 42;`
                    }))
                });
            });
        }

        test('preserves missing globals despite declarations in another script file', async function () {
            const bundle = bundleForCodeFile({
                name: 'package',
                inputFilePath: '/source/index.js',
                targetFilePath: 'index.js',
                content: 'const unused = compute(); export function probe() { return 42; }',
                extraResources: [ {
                    ...bundleResource('/source/other.js', {
                        content: 'function compute() { return 42; }',
                        targetFilePath: 'other.js'
                    }),
                    isSubstituted: false
                } ]
            });
            await assertDeadCodeEliminationEquivalent({
                name: 'script-globals',
                entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
                eliminationInputs: inputs(bundle)
            });
        });

        test('preserves original calls when transformations are disabled', async function () {
            const content = 'function compute() { return 42; }\nexport const value = compute();';
            const bundle = bundleForCodeFile({
                name: 'package',
                inputFilePath: '/source/index.js',
                targetFilePath: 'index.js',
                content
            });
            const result = await createTestEliminator().eliminate(inputWithoutTransformations(bundle));
            assert.strictEqual(result[0]?.contents[0]?.fileDescription.content, content);
        });

        test('specializes a known call within a public function body', async function () {
            const fixture = evaluationCase(
                'function compute(n) { return n * 2; } export function read() { return compute(21); }'
            );
            const called = { ...fixture, entry: { ...fixture.entry, exportName: 'read' } };
            await assertDeadCodeEliminationEquivalent(called);
            const bundles = await eliminateDeadCodeAndAssertAllOutputValid(called);
            const output = bundles[0]?.contents[0]?.fileDescription.content;
            assert.strictEqual(output?.includes('compute'), false);
            assert.strictEqual(output.includes('export function read() { return (42); }'), true);
        });
    });

    suite('elimination', function () {
        const publicComputations = [
            'function compute(n) { return n * 2; } export const value = compute(21);',
            'function compute(n) { return n <= 1 ? n : compute(n - 1) + compute(n - 2); } export const value = compute(6);',
            'function compute(n) { let total = 0; for (let i = 0; i < n; i++) total += i; return total; } export const value = compute(6);',
            'function compute(n) { return n * 2; } export const value = compute(compute(3));',
            'function compute() { return -0; } export const value = compute();',
            'const NaN = 7; function compute() { return 0 / 0; } export const value = compute();',
            'const Infinity = 7; function compute() { return 1 / 0; } export const value = compute();',
            'const Infinity = 7; function compute() { return -1 / 0; } export const value = compute();',
            'const undefined = 7; function compute() { return; } export const value = compute();',
            'function compute() { return "quote\\"\\ntext"; } export const value = compute();',
            'function compute() { return null; } export const value = compute();',
            'function compute() { return false; } export const value = compute();'
        ];

        for (const content of publicComputations) {
            test(`specializes public results: ${content}`, async function () {
                const fixture = evaluationCase(content);
                await assertDeadCodeEliminationEquivalent(fixture);
                const bundles = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
                const output = emittedCode(bundles);
                assert.strictEqual(output.includes('compute'), false);
                assert.strictEqual(output.includes('export const value'), true);
            });
        }

        const removable = [
            'function compute() { return 1; } const unused = compute() + 3;',
            oneLine`function compute() { return 1; } const unused = \`\${compute()}\`;`,
            'function compute() { return 1; } const unused = void compute();',
            'function compute() { return; } const unused = compute();',
            'function compute() { return 3; } const unused = compute();',
            'const unused = (() => 3)();',
            'function compute() { let n = 0; for (let i = 0; i < 3; i++) n += i; return n; } const unused = compute();',
            'function compute(n) { if (n < 0) console.log("effect"); return n; } const unused = compute(1);',
            'function compute(n) { return n <= 1 ? n : compute(n - 1) + compute(n - 2); } const unused = compute(6);'
        ];

        for (const content of removable) {
            test(`removes the complete computation: ${content}`, async function () {
                const fixture = evaluationCase(content);
                await assertDeadCodeEliminationEquivalent(fixture);
                const bundles = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
                const output = emittedCode(bundles);
                assert.strictEqual(output.trim(), 'export function probe() { return 42; }');
            });
        }

        const retained = [
            'function compute() { return 1; } for (compute of [() => console.log("replacement")]) {} const unused = compute();',
            'function compute() { return 1; } ({ compute } = { compute() { console.log("replacement"); } }); const unused = compute();',
            'function compute() { return 1; } function Symbol() { console.log("effect"); } const unused = Symbol(compute());',
            'function compute() { return 1; } const unused = Symbol({ value: compute(), toString() { console.log("coerce"); return "x"; } });',
            'function compute() { return 1; } const unused = Symbol(...compute());',
            oneLine`
                const iterator = Array.prototype[Symbol.iterator];
                Array.prototype[Symbol.iterator] = function () {
                    globalThis.__packtoryDeadCodeEliminationEvents.push("iterate");
                    return iterator.call(this);
                };
                const unused = [...[1, 2]];
                Array.prototype[Symbol.iterator] = iterator;
            `,
            oneLine`
                const iterator = Array.prototype[Symbol.iterator];
                Array.prototype[Symbol.iterator] = function () {
                    globalThis.__packtoryDeadCodeEliminationEvents.push("iterate");
                    return iterator.call(this);
                };
                const unused = Symbol(...[1, 2]);
                Array.prototype[Symbol.iterator] = iterator;
            `,
            'function compute() { return 1; } const unused = compute() + Symbol();',
            'function compute() { return 1; } const unused = compute() + 1n;',
            oneLine`function compute() { return 1; } const unused = \`\${compute()}\${Symbol()}\`;`,
            'function compute() { return 1; } const unused = compute() + { valueOf() { console.log("coerce"); return 2; } };',
            'function compute() { return 1; } const unused = [...compute()];',
            oneLine`function compute() { return 1; }
                const unused = \`\${compute()}\${{ toString() { console.log("coerce"); return "x"; } }}\`;`,
            'function compute() { console.log("effect"); return 42; } const unused = compute();',
            'function compute(n) { if (n < 0) console.log("effect"); return n; } const unused = compute(-1);',
            'function compute(n) { return n + 1; } const unused = compute({ valueOf() { console.log("coerce"); return 1; } });',
            'function compute() { throw new Error("required"); } const unused = compute();',
            'function compute() { return 42; } [compute] = [() => console.log("replacement")]; const unused = compute();',
            'function compute() { return 42; } (eval)("compute = () => console.log(1)"); const unused = compute();',
            'function compute() { const n = 1; n = 2; return n; } const unused = compute();',
            'function compute() { return n; const n = 1; } const unused = compute();'
        ];

        for (const content of retained) {
            test(`preserves observable behavior: ${content}`, async function () {
                await assertDeadCodeEliminationEquivalent(evaluationCase(content));
            });
        }
    });
});
