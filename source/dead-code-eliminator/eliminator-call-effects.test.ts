import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';

const cases = [
    {
        name: 'identity-effect',
        content: 'function pure(value){return value;}const unused=pure(console.log("effect"));',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'factory-effects-in-order',
        content: 'function pure(){return {};}const unused=pure(console.log("first"),console.log("second"));',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'statement-call',
        content: 'function pure(){return [];}pure(console.log("effect"),42);',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'function-creation',
        content: 'function pure(value){return function(){return value;};}const unused=pure(console.log("effect"));',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'getter-creation',
        content:
            'function pure(value){return {get x(){console.log("never");return value;}};}const unused=pure(console.log("effect"));',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'before-function-declaration',
        content: 'const unused=pure(console.log("effect"));function pure(value){return {value};}',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'iife-arguments',
        content: 'const unused=(function(value){return {value};})(console.log("effect"));',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'arrow-arguments',
        content: 'const unused=((value)=>({value}))(console.log("effect"));',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'unknown-argument-read',
        content: 'function pure(value){return value;}const unused=pure(missing);',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'argument-tdz',
        content: 'function pure(value){return {value};}const unused=pure(later);let later=1;',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'creation-effects',
        content: 'function pure(value){return {value};}const unused=pure({x:console.log("effect")});',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'single-statement-var-body',
        content:
            'function pure(value){return value;}if(true)var unused=pure(console.log("first"),console.log("second"));',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'preserve-coercion',
        content:
            'function pure(value){return value+1;}const unused=pure({valueOf(){console.log("coerce");return 1;}});',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-default-effects',
        content: 'function pure(value=console.log("default")){return {};}const unused=pure();',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-destructuring-effects',
        content: 'function pure({value}){return {};}const unused=pure({get value(){console.log("get");}});',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-body-effects',
        content: 'function pure(value){console.log("body");return {};}const unused=pure(console.log("argument"));',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-spread-iteration',
        content:
            'function pure(value){return value;}const iterator={*[Symbol.iterator](){console.log("iterate");yield 1;}};const unused=pure(...iterator);',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-callee-reassignment',
        content: 'function pure(value){return value;}pure=()=>console.log("replacement");const unused=pure(1);',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-alias-reassignment',
        content:
            'function pure(value){return value;}const object={replace(){pure=()=>console.log("replacement");}};object.replace();const unused=pure(1);',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-class-call',
        content: 'class pure{}const unused=pure(console.log("argument"));',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-binding-used',
        content: 'function pure(value){return value;}const result=pure(console.log("effect"));console.log(result);',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'preserve-eval',
        content: 'function pure(value){return value;}const unused=pure(42);console.log(eval("unused"));',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-parameter-assignment',
        content:
            'function pure(value){return value;}function run(value){var value=pure(console.log("effect"));return arguments[0];}module.exports=()=>run(42);',
        targetFilePath: 'index.cjs',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'preserve-directive-boundary',
        content:
            'function pure(value){return value;}const unused=pure(42);"use strict";module.exports=()=>(function(){return this===undefined;})();',
        targetFilePath: 'index.cjs',
        namedCalls: 0,
        inlineCalls: 1
    },
    {
        name: 'preserve-async-assimilation',
        content:
            'async function pure(){return {then(resolve){console.log("then");resolve();}};}const unused=pure(console.log("argument"));',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'preserve-generator',
        content: 'function* pure(){console.log("body");return 1;}const unused=pure(console.log("argument"));',
        targetFilePath: 'index.js',
        namedCalls: 1,
        inlineCalls: 0
    },
    {
        name: 'empty-body',
        content: 'function pure(){}const unused=pure(console.log("effect"));',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'empty-return',
        content: 'function pure(){return;}const unused=pure(console.log("effect"));',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'strict-body',
        content: 'function pure(value){"use strict";return value;}const unused=pure(console.log("effect"));',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'body-preamble',
        content: 'function pure(value){;"preamble";return value;}const unused=pure(console.log("effect"));',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'plain-rest-parameter',
        content: 'function pure(...values){return values;}const unused=pure(console.log("effect"));',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'multiple-declarators',
        content:
            'function pure(value){return {value};}const unused=pure(console.log("first")),live=pure(console.log("second"));console.log(live.value);',
        namedCalls: 1,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'live-public-function',
        content:
            'export function probe(){function pure(value){return {value};}const unused=pure(console.log("effect"));return 42;}',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'conditional-statement-body',
        content:
            'function pure(value){return value;}if(console.log("condition"))pure(console.log("first"),console.log("second"));else console.log("else");',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'callee-changed-by-argument',
        content: 'function pure(value){return value;}const unused=pure((pure=()=>console.log("changed"),1));',
        namedCalls: 1,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'false-body-annotation',
        content:
            '/* @__NO_SIDE_EFFECTS__ */ function pure(value){console.log("body");return {};}const unused=pure(console.log("argument"));',
        namedCalls: 1,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'lexical-call-before-initialization',
        content: 'pure(console.log("argument"));const pure=value=>({value});',
        namedCalls: 1,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'preserve-receiver-read',
        content:
            'function pure(value){return value;}const object={get value(){console.log("get");return 42;}};const unused=pure(object.value);',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'preserve-argument-reference-mode',
        content:
            'function pure(value){return value;}const object={method(){return this===object;}};const unused=pure((console.log("effect"),object.method));',
        namedCalls: 0,
        targetFilePath: 'index.js',
        inlineCalls: 0
    },
    {
        name: 'anonymous-class-argument',
        content: 'function pure(value){return value;}const unused=pure(class {static{console.log(this.name);}});',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'class-property-argument',
        content: 'function pure(value){return value;}const unused=pure({x:class {static{console.log(this.name);}}});',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    },
    {
        name: 'proxy-prototype-argument',
        content:
            'function pure(value){return {__proto__:value};}const prototype=new Proxy({}, {getPrototypeOf(){console.log("prototype");return null;}});const unused=pure((console.log("argument"),prototype));',
        targetFilePath: 'index.js',
        namedCalls: 0,
        inlineCalls: 0
    }
];

function assertRemainingCalls(content: string, named: number, inline: number): void {
    const source = createProject().createSourceFile('output.js', content);
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
    }, { named, inline });
}

suite('unused call effects', function () {
    for (const { name, content, targetFilePath, namedCalls, inlineCalls } of cases) {
        test(`preserves effects and removes only safe calls for ${name}`, async function () {
            const source = targetFilePath.endsWith('.cjs') || content.includes('export function probe')
                ? content
                : `${content}\nexport function probe() { return 42; }`;
            const fixture = singleFileOracleCase(source, targetFilePath);
            await assertDeadCodeEliminationEquivalent(fixture);
            const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            const output = result[0]?.contents[0]?.fileDescription.content;
            assertDefined(output);
            assertRemainingCalls(output, namedCalls, inlineCalls);
        });
    }
});
