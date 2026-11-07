import assert from 'node:assert';
import { suite, test } from 'mocha';
import { ts } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { eliminateCodeModules } from '../test-libraries/eliminator-test-support.ts';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

function printed(content: string): string {
    const sourceFile = ts.createSourceFile('index.js', content, ts.ScriptTarget.Latest);
    return ts.createPrinter().printFile(sourceFile);
}

async function observe(content: string): Promise<unknown> {
    const address = `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
    return runNodeProbe(`
        globalThis.events = [];
        const module = await import(${JSON.stringify(address)});
        console.log(JSON.stringify({ value: module.value, events: globalThis.events }));
    `);
}

suite('eliminator same-line effects', function () {
    const statements = [
        'const before = 1;',
        'const message = "first";',
        'globalThis.events.push(message);',
        'const between = 10;',
        'const second = globalThis.events.push("second");',
        'const after = 3;',
        'export const value = 42;'
    ];
    const singleLine = statements.join(' ');
    const variants = {
        'single line': singleLine,
        multiline: statements.join('\n'),
        printed: printed(singleLine)
    };

    for (const [ format, content ] of Object.entries(variants)) {
        test(`removes unrelated declarations and preserves effects in ${format} source`, async function () {
            const emitted = (await eliminateCodeModules(content, {})).get('index.js');
            assertDefined(emitted);

            for (const name of [ 'before', 'between', 'after' ]) {
                assert.strictEqual(emitted.includes(name), false);
            }
            assert.deepStrictEqual(await observe(emitted), { value: 42, events: [ 'first', 'second' ] });
            assert.deepStrictEqual(await observe(emitted), await observe(content));
        });
    }
});
