import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertModuleEliminationOutput } from '../test-libraries/dead-code-elimination-module-case.ts';

suite('unreachable initializer scope', function () {
    for (
        const declaration of [
            'var value=console.log("unreachable");',
            'let value=console.log("unreachable");',
            'const value=console.log("unreachable");',
            'var {value}=console.log("unreachable");',
            'let {value}=console.log("unreachable");',
            'const [value]=console.log("unreachable");'
        ]
    ) {
        test(`preserves returned closures for ${declaration}`, async function () {
            const content = `function make(){return ()=>value;${declaration}}export function probe(){return make()();}`;
            const modules = await assertModuleEliminationOutput(declaration, content, {});
            assert.strictEqual(Array.from(modules.values()).join('\n').includes('unreachable'), false);
        });
    }

    test('preserves a parameter sharing an unreachable var binding', async function () {
        const modules = await assertModuleEliminationOutput(
            'parameter var binding',
            'function make(value){return ()=>value;var value=console.log("unreachable");}export function probe(){return make(42)();}',
            {}
        );
        assert.strictEqual(Array.from(modules.values()).join('\n').includes('unreachable'), false);
    });
});
