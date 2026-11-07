import assert from 'node:assert';
import { suite, test } from 'mocha';
import { eliminateEntryModule } from '../test-libraries/eliminator-test-support.ts';
import { observeModuleExpression } from '../test-libraries/run-node-probe.ts';

suite('eliminator direct eval', function () {
    for (
        const scenario of [
            { content: 'const hidden = 7; export const probe = () => eval("hidden");', value: 7 },
            { content: 'let hidden = 7; export const probe = () => (eval)("hidden += 1");', value: 8 },
            { content: 'var hidden = 7; export const probe = source => eval(source);', value: 7 },
            { content: 'function hidden() { return 7; } export const probe = () => eval("hidden()");', value: 7 },
            { content: 'class Hidden {} export const probe = () => eval("Hidden.name");', value: 'Hidden' },
            {
                content:
                    'const hidden = 7; export function probe() { const local = 3; return (() => eval("hidden + local"))(); }',
                value: 10
            },
            {
                content:
                    'const hidden = 7; function outer() { return hidden; } export function probe() { const hidden = 3; return eval("hidden + outer()"); }',
                value: 10
            },
            { content: 'const hidden = 7; const value = eval("hidden"); export const probe = () => value;', value: 7 }
        ]
    ) {
        test(`preserves bindings in ${scenario.content}`, async function () {
            const expected = { value: scenario.value };
            assert.deepStrictEqual(await observeModuleExpression(scenario.content, 'module.probe("hidden")'), expected);
            assert.deepStrictEqual(
                await observeModuleExpression(await eliminateEntryModule(scenario.content), 'module.probe("hidden")'),
                expected
            );
        });
    }

    for (
        const expression of [
            '(0, eval)("typeof hidden")',
            'eval?.("typeof hidden")',
            'globalThis.eval("typeof hidden")'
        ]
    ) {
        test(`still prunes module bindings for indirect eval ${expression}`, async function () {
            const content = `const hidden = 7; export const probe = () => ${expression};`;
            const emitted = await eliminateEntryModule(content);

            assert.strictEqual(emitted.includes('const hidden'), false);
            assert.deepStrictEqual(await observeModuleExpression(content, 'module.probe("hidden")'), {
                value: 'undefined'
            });
            assert.deepStrictEqual(await observeModuleExpression(emitted, 'module.probe("hidden")'), {
                value: 'undefined'
            });
        });
    }

    test('prunes bindings referenced only by unreachable direct eval', async function () {
        const content = 'const hidden = 7; function dead() { return eval("hidden"); } export const probe = () => 42;';
        const emitted = await eliminateEntryModule(content);

        assert.strictEqual(emitted.includes('hidden'), false);
        assert.strictEqual(emitted.includes('dead'), false);
        assert.deepStrictEqual(await observeModuleExpression(emitted, 'module.probe("hidden")'), { value: 42 });
    });

    test('preserves temporal dead zone errors from direct eval', async function () {
        const content = 'export const value = eval("hidden"); const hidden = 7; export const probe = () => value;';

        assert.deepStrictEqual(await observeModuleExpression(content, 'module.probe("hidden")'), {
            error: 'ReferenceError'
        });
        assert.deepStrictEqual(
            await observeModuleExpression(await eliminateEntryModule(content), 'module.probe("hidden")'),
            { error: 'ReferenceError' }
        );
    });
});
