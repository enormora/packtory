import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

type ConstructionCase = { readonly name: string; readonly content: string; readonly remaining: number; };

const cases: readonly ConstructionCase[] = [
    { name: 'empty declaration', content: 'class Empty{}const unused=new Empty();', remaining: 0 },
    { name: 'inline class', content: 'const unused=new(class{});', remaining: 0 },
    { name: 'constant class expression', content: 'const Empty=(class{});const unused=new Empty();', remaining: 0 },
    { name: 'constant alias', content: 'class Empty{}const Alias=Empty;const unused=new Alias();', remaining: 0 },
    {
        name: 'unevaluated methods',
        content: 'class Empty{method(){console.log("method");}}const unused=new Empty();',
        remaining: 0
    },
    {
        name: 'static initialization',
        content: 'class Empty{static{console.log("definition");}}const unused=new Empty();',
        remaining: 0
    },
    {
        name: 'inline static initialization',
        content: 'const unused=new(class{static{console.log("definition");}});',
        remaining: 0
    },
    {
        name: 'argument effects',
        content: 'class Empty{}const unused=new Empty(console.log("first"),console.log("second"));',
        remaining: 0
    },
    { name: 'unknown argument reads', content: 'class Empty{}const unused=new Empty(missing);', remaining: 0 },
    {
        name: 'instance fields',
        content: 'class Empty{value=console.log("field");}const unused=new Empty();',
        remaining: 1
    },
    {
        name: 'explicit constructor',
        content: 'class Empty{constructor(){console.log("constructor");}}const unused=new Empty();',
        remaining: 1
    },
    {
        name: 'quoted constructor',
        content: 'class Empty{"constructor"(){console.log("constructor");}}const unused=new Empty();',
        remaining: 1
    },
    {
        name: 'computed constructor method',
        content: 'class Empty{["constructor"](){console.log("method");}}const unused=new Empty();',
        remaining: 0
    },
    { name: 'heritage', content: 'class Empty extends(class{}){}const unused=new Empty();', remaining: 1 },
    { name: 'null heritage', content: 'class Empty extends null{}const unused=new Empty();', remaining: 1 },
    { name: 'early class read', content: 'const unused=new Empty();class Empty{}', remaining: 1 },
    {
        name: 'early function call',
        content: 'create();class Empty{}function create(){return new Empty();}',
        remaining: 1
    },
    {
        name: 'reassignment',
        content: 'class Empty{}Empty=class{constructor(){console.log("replacement");}};const unused=new Empty();',
        remaining: 1
    },
    { name: 'mutable alias', content: 'class Empty{}let Alias=Empty;const unused=new Alias();', remaining: 1 },
    { name: 'spread iteration', content: 'class Empty{}const unused=new Empty(...[1]);', remaining: 1 },
    {
        name: 'direct eval',
        content: 'class Empty{}eval("Empty=class{constructor(){console.log(1);}}");const unused=new Empty();',
        remaining: 1
    },
    {
        name: 'computed key conversion',
        content: 'const unused=new(class{[{toString(){console.log("key");return "member";}}](){}});',
        remaining: 0
    },
    {
        name: 'static prototype method error',
        content: 'const unused=new(class{static ["prototype"](){}});',
        remaining: 0
    },
    {
        name: 'static prototype field error',
        content: 'const unused=new(class{static ["prototype"+""]=42;});',
        remaining: 0
    },
    {
        name: 'inferred class name during initialization',
        content: 'const Empty=class{static{console.log(this.name);}};const unused=new Empty();',
        remaining: 0
    },
    {
        name: 'definition before arguments',
        content: 'const unused=new(class{static{console.log("definition");}})(console.log("argument"));',
        remaining: 0
    },
    {
        name: 'definition errors before arguments',
        content: 'const unused=new(class{static ["prototype"]=42;})(console.log("unreachable"));',
        remaining: 0
    },
    {
        name: 'prototype getter reads',
        content: 'class Empty{get value(){console.log("read");return 42;}}const unused=new Empty().value;',
        remaining: 1
    },
    {
        name: 'instance conversion',
        content: 'class Empty{toString(){console.log("convert");return "value";}}const unused=1+new Empty();',
        remaining: 1
    },
    {
        name: 'destructuring through the prototype',
        content: 'class Empty{get value(){console.log("read");return 42;}}const {value:unused}=new Empty();',
        remaining: 1
    },
    {
        name: 'proxy construction',
        content:
            'const Empty=new Proxy(class{},{construct(){console.log("proxy");return {};}});const unused=new Empty();',
        remaining: 2
    }
];

suite('local construction elimination', function () {
    test('removes the unused class together with its instance', async function () {
        const fixture = singleFileOracleCase(
            'class Empty{}const unused=new Empty();export function probe(){return 42;}',
            'index.js'
        );
        const [ output ] = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
        assertDefined(output);
        const source = createProject().createSourceFile(
            'output.js',
            output
                .contents
                .map(function (resource) {
                    return resource.fileDescription.content;
                })
                .join('\n')
        );
        assert.strictEqual(source.getClasses().length, 0);
        assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.NewExpression).length, 0);
    });
    for (const fixture of cases) {
        test(`preserves ${fixture.name}`, async function () {
            const input = singleFileOracleCase(`${fixture.content}export function probe(){return 42;}`, 'index.js');
            await assertDeadCodeEliminationEquivalent(input);
            const [ output ] = await eliminateDeadCodeAndAssertAllOutputValid(input);
            assertDefined(output);
            const remaining = output.contents.reduce(function (count, resource) {
                const source = createProject().createSourceFile('output.js', resource.fileDescription.content);
                return count + source.getDescendantsOfKind(SyntaxKind.NewExpression).length;
            }, 0);
            assert.strictEqual(remaining, fixture.remaining);
        });
    }
});
