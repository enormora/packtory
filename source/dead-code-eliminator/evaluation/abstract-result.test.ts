import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { isRecordResult, opaqueResult, type AbstractValue } from './abstract-value.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { establishEvaluationEnvironment } from './evaluation-environment-establishment.ts';
import { evaluated } from './primitive-value.ts';

type ExpectedResult = AbstractValue | 'record' | undefined;

function knownValueOf(content: string): AbstractValue | 'record' | undefined {
    const source = createProject().createSourceFile('input.js', `${content}\nexport {};`);
    establishEvaluationEnvironment([ source ], undefined, resolveRuntimeModule);
    const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    const value = createSourceEvaluation(source).knownValue(expression);
    return value !== undefined && isRecordResult(value) ? 'record' : value;
}

const operatorCases: readonly (readonly [string, ExpectedResult])[] = [
    [ 'const value = /x/ || 1;', opaqueResult('value') ],
    [ 'const value = typeof /x/ || 1;', opaqueResult('primitive') ],
    [ 'const value = typeof /x/ || /y/;', opaqueResult('value') ],
    [ 'const value = /x/ && 1 + 2;', opaqueResult('value') ],
    [ 'const value = !/x/;', opaqueResult('primitive') ],
    [ 'const value = -(typeof /x/);', opaqueResult('primitive') ],
    [ 'function probe() { let a = 0; /x/ && (a = 1); return a; }\nconst value = probe();', undefined ],
    [ 'function probe() { let a = 0; /x/ && a++; return a; }\nconst value = probe();', undefined ],
    [ 'function probe() { let a = 0; /x/ && -a; return a; }\nconst value = probe();', evaluated(0) ]
];

const literalCases: readonly (readonly [string, ExpectedResult])[] = [
    [ 'const base = [ 1, 2 ];\nconst value = [ ...base, 3 ];', opaqueResult('array') ],
    [ 'const base = { a: 1 };\nconst value = { ...base, b: 1 };', opaqueResult('object') ],
    [ 'const base = { a: 1 };\nconst value = { ...base, get b() { return 1; } };', opaqueResult('value') ],
    [ 'const base = { a: 1 };\nconst value = { ...base, set b(next) {} };', opaqueResult('value') ],
    [ 'const base = { a: 1 };\nconst value = { ...base, b: compute() };', undefined ],
    [ 'const base = { a: 1 };\nconst value = base;', opaqueResult('object') ],
    [ 'const base = { get a() { return 1; } };\nconst value = base;', opaqueResult('value') ],
    [ 'const base = { a: 1 };\nbase.a = 2;\nconst value = base;', opaqueResult('value') ],
    [ 'const value = class { static x = 1; };', opaqueResult('value') ],
    [ 'const key = "a";\nconst value = class { static [key] = 1; };', opaqueResult('value') ],
    [ 'const value = class { static x = compute(); };', undefined ]
];

const callCases: readonly (readonly [string, ExpectedResult])[] = [
    [ 'const value = /*#__PURE__*/ make();', opaqueResult('value') ],
    [ 'const value = /x/ || Symbol();', opaqueResult('value') ],
    [ 'const value = /x/ || Symbol(compute());', undefined ],
    [ 'const value = /x/ || Symbol(/y/);', undefined ],
    [ 'const value = /*#__PURE__*/ new Holder(1);', 'record' ],
    [ 'const value = /*#__PURE__*/ new Holder(compute());', undefined ],
    [ 'const value = /*#__PURE__*/ new Holder(1, compute());', undefined ],
    [ 'const value = /*#__PURE__*/ new Holder(...[ 1 ]);', undefined ],
    [ 'const value = Sym.bol("a");', undefined ],
    [ 'const value = (other || Symbol)("a");', undefined ],
    [ 'const value = new S.et();', undefined ],
    [ 'const value = new Map([ [ 1, 2 ] ]);', 'record' ],
    [ 'const value = new Map([ [ 1, 2 ], 3 ]);', undefined ]
];

const hugeBigIntLiteral = `0x${'f'.repeat(1025)}n`;

const bigintCases: readonly (readonly [string, ExpectedResult])[] = [
    [ 'const value = 5n ** 0n;', evaluated(1n) ],
    [ 'const value = 0n ** 5000n;', evaluated(0n) ],
    [ 'const value = 2n ** 2048n;', evaluated(2n ** 2048n) ],
    [ 'const value = (-2n) ** 2048n;', evaluated(2n ** 2048n) ],
    [ 'const value = 2n ** 2049n;', opaqueResult('oversized-bigint') ],
    [ 'const value = 2n ** 524288n;', opaqueResult('oversized-bigint') ],
    [ 'const value = 2n ** 524289n;', undefined ],
    [ 'const value = 5n ** -1n;', undefined ],
    [ 'const value = 2n ** 2048n * 2n ** 2048n;', opaqueResult('oversized-bigint') ]
];

suite('abstract results', function () {
    for (
        const [ name, cases ] of [
            [ 'operators', operatorCases ],
            [ 'literals and constants', literalCases ],
            [ 'calls and constructions', callCases ],
            [ 'bigint arithmetic', bigintCases ]
        ] as const
    ) {
        suite(name, function () {
            for (const [ content, expected ] of cases) {
                test(`evaluates ${content}`, function () {
                    assert.deepStrictEqual(knownValueOf(content), expected);
                });
            }
        });
    }

    test('creates a symbol through a computed global key', function () {
        const value = knownValueOf('const value = globalThis["Symbol"]("a");');

        assert.ok(value !== undefined && value !== 'record');
        assert.strictEqual(typeof value.value, 'symbol');
    });

    test('does not reason about bigint operands beyond the evaluation bound', function () {
        assert.strictEqual(knownValueOf(`const value = ${hugeBigIntLiteral} * 2n;`), undefined);
        assert.strictEqual(knownValueOf(`const value = 2n * ${hugeBigIntLiteral};`), undefined);
    });
});
