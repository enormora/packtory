import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';

const cases = [
    {
        name: 'remove-nested-unused-patterns',
        content: 'const {method:unused}={method(){const {x:ignored}={x:1};}};',
        removesPattern: true
    },
    {
        name: 'preserve-exponent-key-default',
        content: 'const {5e-324:unused=console.log("default")}={5:1};',
        removesPattern: false
    },
    {
        name: 'bypass-exponent-key-default',
        content: 'const {5e-324:unused=console.log("unreachable")}={5e-324:1,5:9};',
        removesPattern: true
    },
    {
        name: 'preserve-exported-pattern',
        content: 'const {x}={x:1};export {x};',
        removesPattern: false
    },
    {
        name: 'preserve-shorthand-pattern-use',
        content: 'const {x}={x:1};console.log({x});',
        removesPattern: false
    },
    {
        name: 'preserve-getter-this-mutation',
        content: 'const object={x:1,get y(){this.x++;return 3;}};const {y:unused}=object;console.log(object.x);',
        removesPattern: false
    },
    {
        name: 'preserve-getter-undefined-default',
        content: 'const {x=console.log("default")}={get x(){return void 0;}};',
        removesPattern: false
    },
    {
        name: 'preserve-creation-order',
        content: 'const {x=console.log("unreachable")}={a:console.log("first"),x:1,b:console.log("last")};',
        removesPattern: true
    },
    {
        name: 'preserve-pattern-in-initializer',
        content: 'const {x}={x:console.log(typeof x)};',
        removesPattern: false
    },
    {
        name: 'null-prototype-own-method',
        content: 'const {__proto__:unused=console.log("unreachable")}={__proto__:null,__proto__(){return 3;}};',
        removesPattern: true
    },
    {
        name: 'preserve-shared-object-alias',
        content:
            'const object={x:1};const alias=object;alias.x=undefined;const {x:unused=console.log("default")}=object;',
        removesPattern: false
    },
    {
        name: 'preserve-class-field-name',
        content: 'const {x:unused}={x:class{static{console.log(this.name)}}};',
        removesPattern: true
    },
    {
        name: 'preserve-active-unknown-default',
        content: 'const {x:unused=console.log("default")}={x:console.log("initializer")};',
        removesPattern: false
    },
    {
        name: 'bypassed-with-effect-default',
        content: 'const {x=console.log("unreachable")}={x:1};',
        removesPattern: true
    },
    {
        name: 'bypassed-default-with-rhs-effects',
        content: 'const {x=console.log("unreachable")}={x:1,y:console.log("rhs")};',
        removesPattern: true
    },
    {
        name: 'pure-getter',
        content: 'const object={get x(){return 3;}};const {x:unused}=object;',
        removesPattern: true
    },
    {
        name: 'getter-defines-value',
        content: 'const {x:unused=console.log("unreachable")}={get x(){return 3;}};',
        removesPattern: true
    },
    {
        name: 'null-prototype-default',
        content: 'const {x=3}={__proto__:null};',
        removesPattern: true
    },
    {
        name: 'unknown-data-value',
        content: 'const {x:unused}={x:console.log("rhs")};',
        removesPattern: true
    },
    {
        name: 'pure-default-for-unknown-data',
        content: 'const {x:unused=3}={x:console.log("rhs")};',
        removesPattern: true
    },
    {
        name: 'preserve-active-default',
        content: 'const {x=console.log("default")}={x:void 0};',
        removesPattern: false
    },
    {
        name: 'preserve-getter-effects',
        content: 'const object={get x(){console.log("get");return 3;}};const {x:unused}=object;',
        removesPattern: false
    },
    {
        name: 'preserve-inherited-getter',
        content:
            'Object.defineProperty(Object.prototype,"x",{get(){console.log("get");return 1;}});const {x:unused}={};',
        removesPattern: false
    },
    {
        name: 'preserve-class-name',
        content: 'const {x:unused}={x:class {static{console.log(this.name);}}};',
        removesPattern: true
    },
    {
        name: 'preserve-pattern-tdz',
        content: 'const {x}={x:class {static{console.log(x);}}};',
        removesPattern: false
    },
    {
        name: 'preserve-object-escape',
        content:
            'const object={x:1};function change(value){value.x=undefined;}change(object);const {x:unused=console.log("default")}=object;',
        removesPattern: false
    },
    {
        name: 'preserve-computed-key-effects',
        content: 'const {[console.log("key")]:unused}={};',
        removesPattern: false
    },
    {
        name: 'preserve-missing-null',
        content: 'const {x:unused}=null;',
        removesPattern: false
    },
    {
        name: 'preserve-rest-enumeration',
        content: 'const {...unused}={get x(){console.log("get");return 1;}};',
        removesPattern: false
    },
    {
        name: 'preserve-setter-default',
        content: 'const {x:unused=console.log("default")}={set x(value){console.log("setter");}};',
        removesPattern: false
    },
    {
        name: 'escaped-getter-key',
        content: 'const {x:unused}={get \\u0078(){console.log("get");return 1;}};',
        removesPattern: false
    },
    {
        name: 'pure-escaped-getter',
        content: 'const {x:unused}={get \\u0078(){return 3;}};',
        removesPattern: true
    },
    {
        name: 'preserve-pattern-dependency',
        content: 'const {x=1,y=x}={x:void 0,y:void 0};console.log(y);',
        removesPattern: false
    },
    {
        name: 'preserve-prototype-getter',
        content: 'const object={__proto__:{get x(){console.log("prototype");return 1;}}};const {x:unused}=object;',
        removesPattern: false
    }
];

suite('object binding reduction', function () {
    for (const { name, content, removesPattern } of cases) {
        test(`preserves behavior for ${name}`, async function () {
            const fixture = singleFileOracleCase(`${content}\nexport function probe() { return 42; }`, 'index.js');
            await assertDeadCodeEliminationEquivalent(fixture);
            if (removesPattern) {
                const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
                const output = result[0]?.contents[0]?.fileDescription.content;
                assertDefined(output);
                assert.doesNotMatch(output, /\b(?:const|let|var)\s*\{/u);
            }
        });
    }

    test('preserves destructuring assignments to mapped CommonJS parameters', async function () {
        await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
            `function run(value) {
                var {value} = {value: console.log("effect")};
                return arguments[0];
            }
            module.exports = () => run(42);`,
            'index.cjs'
        ));
    });

    test('preserves binding values read by direct eval', async function () {
        await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
            'const {x} = {x: 1}; export function probe() { return eval("x"); }',
            'index.js'
        ));
    });
});
