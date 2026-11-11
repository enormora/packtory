import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';

const cases = [
    [
        'null-optional-call',
        'const receiver=null;const unused=receiver?.method(console.log("unreachable"));',
        'index.js'
    ],
    [
        'null-optional-key',
        'const receiver=null;const unused=receiver?.[console.log("unreachable")];',
        'index.js'
    ],
    [
        'null-contiguous-chain',
        'const receiver=null;const unused=receiver?.member.deep(console.log("unreachable")).more;',
        'index.js'
    ],
    [
        'undefined-optional-call',
        'const receiver=void 0;const unused=receiver?.(console.log("unreachable"));',
        'index.js'
    ],
    [
        'parenthesized-chain-boundary',
        'const receiver=null;const unused=(receiver?.member).deep;',
        'index.js'
    ],
    [
        'parenthesized-call-boundary',
        'const receiver=null;const unused=(receiver?.method)(console.log("effect"));',
        'index.js'
    ],
    [
        'delete-optional',
        'const receiver=null;console.log(delete receiver?.member);',
        'index.js'
    ],
    [
        'preserve-free-tdz',
        'probe();const value=42;export function probe(){return value;}',
        'index.js'
    ],
    [
        'preserve-switch-dominance',
        'switch(1){case 0: const value=42;break;case 1: console.log(value);} ',
        'index.js'
    ],
    [
        'const-condition',
        'const enabled=false;if(enabled){console.log("unreachable");}',
        'index.js'
    ],
    [
        'const-alias-chain',
        'const first=null;const receiver=first;const unused=receiver?.method(console.log("unreachable"));',
        'index.js'
    ],
    [
        'shorthand-property',
        'const value=42;const object={value};console.log(object);',
        'index.js'
    ],
    [
        'preserve-const-assignment',
        'const value=42;try{value=1;}catch(error){console.log(error.name);}console.log(value);',
        'index.js'
    ],
    [
        'preserve-shadowed-binding',
        'const value=42;{console.log(value);const value=1;}',
        'index.js'
    ],
    [
        'preserve-getter-effects',
        'const object={get value(){console.log("get");return null;}};const unused=object.value?.method();',
        'index.js'
    ],
    [
        'nested-optional-argument',
        'const object={method(value){console.log(value);}};object?.method(null?.value);',
        'index.js'
    ],
    [
        'same-activation-local',
        'export function probe(){const value=42;return value;}',
        'index.js'
    ],
    [
        'preserve-closure-activation',
        'export function probe(){function read(){return value;}console.log(read());const value=42;return read();}',
        'index.js'
    ],
    [
        'nullish-with-throwing-tail',
        'const receiver=null;console.log(receiver?.member.deep);',
        'index.js'
    ],
    [
        'console-binding',
        'const unused=console.log("effect");'
    ],
    [
        'getter-binding',
        'const object={get value(){console.log("get");return 1;}};const unused=object.value;'
    ],
    [
        'proxy-binding',
        'const object=new Proxy({}, {get(){console.log("trap");return 1;}});const unused=object.value;'
    ],
    [
        'spread-binding',
        'const object={get value(){console.log("get");return 1;}};const unused={...object};'
    ],
    [
        'missing-global',
        'const unused=missing;'
    ],
    [
        'lexical-tdz',
        'const unused=later;let later=1;'
    ],
    [
        'multiple-declarators',
        'const unused=console.log("first"),live=console.log("second");console.log(live);'
    ],
    [
        'multiple-mixed-declarators',
        'const live=1,unused=console.log("effect"),last=2;console.log(live,last);'
    ],
    [
        'unused-construction',
        'class Empty{} const unused=new Empty();'
    ],
    [
        'preserve-class-name',
        'const unused=class {static{console.log(this.name);}};'
    ],
    [
        'preserve-class-outer-tdz',
        'const unused=class {static{console.log(unused);}};'
    ],
    [
        'preserve-using',
        '{using unused={ [Symbol.dispose](){console.log("dispose");} };}'
    ],
    [
        'preserve-eval',
        'const unused=42;console.log(eval("unused"));'
    ],
    [
        'live-inner-local',
        'export function probe(){const unused=9;return 42;}'
    ],
    [
        'inner-local-with-effect',
        'export function probe(){const unused=console.log("effect");return 42;}'
    ],
    [
        'preserve-called-before-initialization',
        'probe();const value=1;export function probe(){const unused=value;return 42;}'
    ],
    [
        'var-single-statement-body',
        'if(true) var unused=console.log("effect");'
    ],
    [
        'switch-lexical-scope',
        'switch(1){case 1:let unused=console.log("effect"),live=42;console.log(live);break;case 2:console.log(live);}'
    ],
    [
        'preserve-binding-reads',
        'const unused=42;export function probe(){return unused;}'
    ],
    [
        'preserve-mapped-arguments',
        'export function probe(unused){var unused=console.log("effect");return arguments.length;}'
    ]
];

suite('source preparation elimination', function () {
    for (const [ name, content ] of cases) {
        test(`preserves runtime behavior for ${name}`, async function () {
            assertDefined(content);
            const source = content.includes('export function probe')
                ? content
                : `${content}\nexport function probe() { return 42; }`;
            const fixture = singleFileOracleCase(source, 'index.js');
            await assertDeadCodeEliminationEquivalent(fixture);
            const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            const output = result[0]?.contents[0]?.fileDescription.content;
            assertDefined(output);
            assert.strictEqual(output.includes('unreachable'), false);
        });
    }

    test('removes unused locals inside a public function', async function () {
        const fixture = singleFileOracleCase('export function probe() { const unused = 9; return 42; }', 'index.js');
        const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
        assert.strictEqual(result[0]?.contents[0]?.fileDescription.content.includes('unused'), false);
    });

    test('preserves assignments to mapped CommonJS arguments', async function () {
        await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
            `function run(value) {
                var value = console.log("effect");
                return arguments[0];
            }
            module.exports = () => run(42);`,
            'index.cjs'
        ));
    });

    test('drops an unused console result while preserving the call', async function () {
        const fixture = singleFileOracleCase(
            'const unused = console.log("effect"); export function probe() { return 42; }',
            'index.js'
        );
        const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
        const output = result[0]?.contents[0]?.fileDescription.content;
        assertDefined(output);
        assert.doesNotMatch(output, /unused/u);
        assert.match(output, /console\.log/u);
    });
    for (
        const body of [
            'const unused = 42; "use strict"; return this === undefined;',
            '42; "use strict"; return this === undefined;',
            '; "use strict"; return this === undefined;',
            '"use strict"; const unused = 42; return this === undefined;'
        ]
    ) {
        test(`preserves directive boundaries in ${body}`, async function () {
            await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
                `module.exports = function () { ${body} };`,
                'index.cjs'
            ));
        });
    }
});
