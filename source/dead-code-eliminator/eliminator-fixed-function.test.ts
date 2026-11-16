import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertEquivalentModules } from '../test-libraries/dead-code-elimination-module-case.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { assertDeadCodeEliminationEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

const cases = [
    {
        name: 'selected switch with a labeled break',
        content:
            'export function probe(){outer:{switch(2){case 1:return 1;case 2:break outer;}console.log("unused");}return 42;}',
        kind: SyntaxKind.SwitchStatement,
        count: 0
    },
    {
        name: 'selected switch with an inner loop break',
        content:
            'export function probe(){switch(2){case 1:return 1;case 2:while(true){console.log("selected");break;}}return 42;}',
        kind: SyntaxKind.SwitchStatement,
        count: 0
    },
    {
        name: 'fixed loop with no return value',
        content: 'export function probe(){"use strict";let sum=0;for(let index=1;index<=6;index++)sum+=index;}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'fixed class method loop',
        content:
            'export class Counter{value(){let sum=0;for(let index=1;index<=6;index++)sum+=index;return sum;}}export function probe(){return new Counter().value();}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'fixed object method loop',
        content:
            'export const counter={value(){let sum=0;for(let index=1;index<=6;index++)sum+=index;return sum;}};export function probe(){return counter.value();}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'parameter dependent method loop remains',
        content:
            'export class Counter{value(limit=6){let sum=0;for(let index=1;index<=limit;index++)sum+=index;return sum;}}export function probe(){return new Counter().value();}',
        kind: SyntaxKind.ForStatement,
        count: 1
    },
    {
        name: 'receiver dependent method loop remains',
        content:
            'export class Counter{value(){let sum=0;for(let index=1;index<=this.limit;index++)sum+=index;return sum;}}export function probe(){const counter=new Counter();counter.limit=6;return counter.value();}',
        kind: SyntaxKind.ForStatement,
        count: 1
    },
    {
        name: 'async method stays a promise',
        content:
            'export class Counter{async value(){let sum=0;for(let index=1;index<=6;index++)sum+=index;return sum;}}export async function probe(){return await new Counter().value();}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'generator method stays lazy',
        content:
            'export class Counter{*value(){let sum=0;for(let index=1;index<=6;index++)sum+=index;return sum;}}export function probe(){return new Counter().value().next().value;}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'async generator completion stays asynchronous',
        content:
            'export async function* values(){let sum=0;for(let index=1;index<=6;index++)sum+=index;return sum;}export async function probe(){return await values().next();}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'executed await prevents async body folding',
        content:
            'export async function probe(){let sum=0;for(let index=1;index<=6;index++)sum+=index;await Promise.resolve();return sum;}',
        kind: SyntaxKind.ForStatement,
        count: 1
    },
    {
        name: 'executed yield prevents generator body folding',
        content:
            'export function* values(){let sum=0;for(let index=1;index<=6;index++)sum+=index;yield sum;return 99;}export function probe(){const iterator=values();return [iterator.next(),iterator.next()];}',
        kind: SyntaxKind.ForStatement,
        count: 1
    },
    {
        name: 'fixed for loop',
        content: 'export function probe(){let sum=0;for(let i=1;i<=6;i++)sum+=i;return sum;}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'fixed while loop',
        content: 'export function probe(){let sum=0,i=1;while(i<=6){sum+=i;i++;}return sum;}',
        kind: SyntaxKind.WhileStatement,
        count: 0
    },
    {
        name: 'fixed switch',
        content: 'export function probe(){switch(2){case 1:return 1;case 2:return 42;default:return 0;}}',
        kind: SyntaxKind.SwitchStatement,
        count: 0
    },
    {
        name: 'selected switch effect',
        content:
            'export function probe(){switch(2){case 1:console.log("unused");return 1;case 2:console.log("selected");return 42;default:return 0;}}',
        kind: SyntaxKind.SwitchStatement,
        count: 0
    },
    {
        name: 'selected default effect',
        content:
            'export function probe(){switch(2){case "2":console.log("unused");return 1;default:console.log("selected");return 42;}}',
        kind: SyntaxKind.SwitchStatement,
        count: 0
    },
    {
        name: 'unmatched switch without a default',
        content: 'export function probe(value=42){switch(2){case 1:console.log("unused");}return value;}',
        kind: SyntaxKind.SwitchStatement,
        count: 0
    },
    {
        name: 'unknown switch discriminator',
        content: 'export function probe(value=2){switch(value){case 1:return 1;case 2:return 42;default:return 0;}}',
        kind: SyntaxKind.SwitchStatement,
        count: 1
    },
    {
        name: 'switch break and fallthrough',
        content:
            'export function probe(){switch(2){case 1:console.log("unused");break;case 2:console.log("selected");case 3:console.log("fallthrough");break;default:console.log("unused");}return 42;}',
        kind: SyntaxKind.SwitchStatement,
        count: 0
    },
    {
        name: 'conditional break keeps its switch target',
        content:
            'export function probe(value=true){switch(2){case 1:return 1;case 2:if(value)break;console.log("fallthrough");default:console.log("default");}return 42;}',
        kind: SyntaxKind.CaseClause,
        count: 0
    },
    {
        name: 'switch label evaluation effects',
        content: 'export function probe(){switch(2){case (console.log("label"),1):return 1;case 2:return 42;}}',
        kind: SyntaxKind.SwitchStatement,
        count: 1
    },
    {
        name: 'switch lexical temporal dead zone',
        content: 'export function probe(){switch(2){case 1:let value=1;break;case 2:return value;}}',
        kind: SyntaxKind.SwitchStatement,
        count: 1
    },
    {
        name: 'switch class temporal dead zone',
        content: 'export function probe(){switch(2){case 1:class Value{};break;case 2:return typeof Value;}}',
        kind: SyntaxKind.SwitchStatement,
        count: 1
    },
    {
        name: 'switch function initialized before its case',
        content:
            'export function probe(){switch(2){case 1:function value(){return 42;}break;case 2:return value.name;}}',
        kind: SyntaxKind.SwitchStatement,
        count: 1
    },
    {
        name: 'unselected var binding remains hoisted',
        content:
            'export function probe(){switch(2){case 1:var value=console.log("unused");break;case 2:console.log("selected");}return value;}',
        kind: SyntaxKind.SwitchStatement,
        count: 1
    },
    {
        name: 'strict directive survives body folding',
        content:
            'function strict(){"use strict";let sum=0;for(let i=1;i<=6;i++)sum+=i;return sum;}export function probe(){try{return strict.caller;}catch(error){return error.name;}}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'parameter dependent loop remains',
        content: 'export function probe(limit=6){let sum=0;for(let i=1;i<=limit;i++)sum+=i;return sum;}',
        kind: SyntaxKind.ForStatement,
        count: 1
    },
    {
        name: 'parameter default effects survive body folding',
        content:
            'export function probe(value=console.log("default")){let sum=0;for(let i=1;i<=6;i++)sum+=i;return sum;}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'async result stays a promise',
        content: 'export async function probe(){let sum=0;for(let i=1;i<=6;i++)sum+=i;return sum;}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'generator execution stays lazy',
        content: 'export function* probe(){let sum=0;for(let i=1;i<=6;i++)sum+=i;return sum;}',
        kind: SyntaxKind.ForStatement,
        count: 0
    },
    {
        name: 'direct eval scope remains',
        content: 'export function probe(){let sum=0;for(let i=1;i<=6;i++)sum+=i;return eval("sum");}',
        kind: SyntaxKind.ForStatement,
        count: 1
    }
];

suite('fixed function reductions', function () {
    test('preserves a CommonJS function directive when its computation disappears', async function () {
        const content =
            'function strict(){"use strict";let sum=0;for(let index=1;index<=6;index++)sum+=index;return sum;}' +
            'module.exports=function probe(){try{return strict.caller;}catch(error){return error.name;}};';
        const [ output ] = await assertDeadCodeEliminationEquivalent(singleFileOracleCase(content, 'index.cjs'));
        const source = createProject().createSourceFile(
            'output.cjs',
            output?.contents[0]?.fileDescription.content ?? ''
        );
        assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.ForStatement).length, 0);
    });
    for (const fixture of cases) {
        test(`preserves ${fixture.name}`, async function () {
            const modules = await assertEquivalentModules(fixture.name, fixture.content, {});
            const output = Array.from(modules.values()).join('\n');
            const source = createProject().createSourceFile('output.js', output);
            assert.strictEqual(source.getDescendantsOfKind(fixture.kind).length, fixture.count);
        });
    }
});
