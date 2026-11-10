import assert from 'node:assert';
import { oneLine } from 'common-tags';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { isPureExpression } from '../test-libraries/expression-purity-test-support.ts';
import { initializerFromProjectFiles, variableInitializer } from './pure-expression-test-support.ts';

suite('local call evaluation', function () {
    test('retains calls whose lexical lookup can be changed by with', function () {
        const expression = initializerFromProjectFiles([
            {
                filePath: '/project/source/index.ts',
                content:
                    'function compute() { return 42; } const schema = () => { with ({ compute: console.log }) { compute(); } };'
            }
        ]);
        const call = expression.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
        assert.strictEqual(isPureExpression(call, undefined), false);
    });

    test('does not treat another script file as a runtime lexical scope', function () {
        const expression = initializerFromProjectFiles([
            { filePath: '/project/source/index.ts', content: 'const schema = compute();' },
            { filePath: '/project/source/other.ts', content: 'function compute() { return 42; }' }
        ]);
        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('preserves an unresolved read beside a proven primitive call', function () {
        const expression = initializerFromProjectFiles([
            {
                filePath: '/project/source/index.ts',
                content: 'function compute() { return 1; } const schema = compute() === missing;'
            },
            { filePath: '/project/source/other.ts', content: 'function missing() { return 42; }' }
        ]);
        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('does not infer runtime presence from an ambient declaration', function () {
        const expression = variableInitializer(
            'declare const missing: unknown; function compute() { return 1; } const unused = compute() === missing;',
            'unused'
        );
        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    const removable = [
        'function compute() { return 1; } const unused = compute() + 3;',
        oneLine`function compute() { return 1; } const unused = \`\${compute()}\`;`,
        'function compute() { return 1; } const unused = void compute();',
        'function compute() { return; } const unused = compute();',
        'function compute() { return 42; } const unused = compute();',
        'const unused = (() => 42)();',
        'const unused = (function () { return 42; })();',
        'function compute(n) { return n * 2; } const unused = compute(21);',
        'function compute() { let n = 0; for (let i = 0; i < 3; i++) n += i; return n; } const unused = compute();',
        'function compute(n) { if (n < 0) console.log("effect"); return n; } const unused = compute(1);',
        'function compute(n) { return n > 0 ? 42 : missing(); } const unused = compute(1);',
        'function compute(n) { return n > 0 && missing(); } const unused = compute(-1);',
        'function compute() { return; missing(); } const unused = compute();',
        'function square(n) { return n * n; } function compute(n) { return square(n); } const unused = compute(4);',
        'function fib(n) { return n <= 1 ? n : fib(n - 1) + fib(n - 2); } const unused = fib(6);',
        'function compute() { let n = 1; { n = 2; } return n; } const unused = compute();'
    ];

    for (const content of removable) {
        test(`proves ${content}`, function () {
            assert.strictEqual(isPureExpression(variableInitializer(content, 'unused'), undefined), true);
        });
    }

    const retained = [
        'function compute() { return 1; } for (compute of [() => console.log("replacement")]) {} const unused = compute();',
        'function compute() { return 1; } ({ compute } = { compute() { console.log("replacement"); } }); const unused = compute();',
        'function compute() { return 1; } function Symbol() { console.log("effect"); } const unused = Symbol(compute());',
        'function compute() { return 1; } const unused = Symbol({ value: compute(), toString() { console.log("coerce"); return "x"; } });',
        'function compute() { return 1; } const unused = Symbol(...compute());',
        'function compute() { return 1; } const unused = compute() + Symbol();',
        'function compute() { return 1; } const unused = compute() + 1n;',
        oneLine`function compute() { return 1; } const unused = \`\${compute()}\${Symbol()}\`;`,
        'function compute() { return 1; } const unused = compute() + { valueOf() { console.log("coerce"); return 2; } };',
        'function compute() { return 1; } const unused = [...compute()];',
        oneLine`function compute() { return 1; }
            const unused = \`\${compute()}\${{ toString() { console.log("coerce"); return "x"; } }}\`;`,
        'function compute() { console.log("effect"); return 42; } const unused = compute();',
        'function compute(n) { if (n < 0) console.log("effect"); return n; } const unused = compute(-1);',
        'function compute(n) { return n * 2; } const unused = compute({ valueOf() { console.log("effect"); return 1; } });',
        'function compute() { throw new Error(); } const unused = compute();',
        'function compute() { for (let i = 0; i < 1; i = 0) {} } const unused = compute();',
        'function compute() { return compute(); } const unused = compute();',
        'function compute() { return missing; } const unused = compute();',
        'function compute() { return 42; } compute = () => console.log("effect"); const unused = compute();',
        'function compute() { return 42; } [compute] = [() => console.log("effect")]; const unused = compute();',
        'function compute() { return 42; } (eval)("compute = () => console.log(1)"); const unused = compute();',
        'async function compute() { return 42; } const unused = compute();',
        'function* compute() { return 42; } const unused = compute();',
        'function compute(n = console.log("effect")) { return 42; } const unused = compute();',
        'function compute() { const n = 1; n = 2; return n; } const unused = compute();',
        'function compute() { return n; const n = 1; } const unused = compute();',
        'function compute() { return this; } const unused = compute();',
        'function compute() { return 42; } const unused = compute(console.log("argument"));',
        'function compute() { return 42; } const unused = compute(...[1]);'
    ];

    for (const content of retained) {
        test(`retains ${content}`, function () {
            assert.strictEqual(isPureExpression(variableInitializer(content, 'unused'), undefined), false);
        });
    }
});
