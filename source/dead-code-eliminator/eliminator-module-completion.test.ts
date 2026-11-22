import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertModuleEliminationOutput } from '../test-libraries/dead-code-elimination-module-case.ts';

const cases = [
    {
        name: 'arithmetic from a logging dependency',
        content: 'import {value} from "./dep.js";export function probe(){return value*2;}',
        modules: { 'dep.js': 'console.log("initialize");export const value=21;' },
        removes: 'const value'
    },
    {
        name: 'call from a logging dependency',
        content: 'import {twice} from "./dep.js";export function probe(){return twice(21);}',
        modules: { 'dep.js': 'console.log("initialize");export function twice(value){return value*2;}' },
        removes: 'function twice'
    },
    {
        name: 'callee captures an initialized module constant',
        content: 'import {twice} from "./dep.js";export function probe(){return twice(21);}',
        modules: {
            'dep.js': 'console.log("initialize");const factor=2;export function twice(value){return value*factor;}'
        },
        removes: 'function twice'
    },
    {
        name: 'forwarded callable',
        content: 'import {twice} from "./barrel.js";export function probe(){return twice(21);}',
        modules: {
            'barrel.js': 'export {twice} from "./dep.js";',
            'dep.js': 'console.log("initialize");export function twice(value){return value*2;}'
        },
        removes: 'function twice'
    },
    {
        name: 'namespace callable with an unused receiver',
        content: 'import * as dep from "./dep.js";export function probe(){return dep.twice(21);}',
        modules: { 'dep.js': 'console.log("initialize");export const twice=value=>value*2;' },
        removes: 'const twice'
    },
    {
        name: 'namespace alias and computed key',
        content:
            'import * as dep from "./dep.js";const alias=dep;export const value=alias["value"];export function probe(){return value;}',
        modules: { 'dep.js': 'export const value=42;export const unused=9;' },
        removes: 'alias'
    },
    {
        name: 'throwing module before its constant',
        content: 'import {value} from "./dep.js";export function probe(){return value*2;}',
        modules: { 'dep.js': 'console.log("initialize");throw new Error("stop");export const value=21;' },
        removes: 'const value'
    }
];
const retained = [
    {
        name: 'cycle reads an uninitialized binding',
        content: 'import {value} from "./dep.js";export function probe(){return value;}',
        modules: { 'dep.js': 'import {probe} from "./index.js";console.log(probe());export const value=42;' }
    },
    {
        name: 'callee local shadow remains uninitialized',
        content: 'import {twice} from "./dep.js";export function probe(){return twice(21);}',
        modules: { 'dep.js': 'const factor=2;export function twice(value){return value*factor;const factor=3;}' }
    },
    {
        name: 'callee captures a mutable module binding',
        content: 'import {twice} from "./dep.js";export function probe(){return twice(21);}',
        modules: { 'dep.js': 'let factor=2;factor=3;export function twice(value){return value*factor;}' }
    },
    {
        name: 'callee argument effect',
        content: 'import {twice} from "./dep.js";export function probe(){return twice((console.log("argument"),21));}',
        modules: { 'dep.js': 'console.log("initialize");export function twice(value){return value*2;}' }
    },
    {
        name: 'callee default effect',
        content: 'import {twice} from "./dep.js";export function probe(){return twice();}',
        modules: { 'dep.js': 'export function twice(value=(console.log("default"),21)){return value*2;}' }
    },
    {
        name: 'namespace receiver',
        content: 'import * as dep from "./dep.js";export function probe(){return dep.twice(21);}',
        modules: { 'dep.js': 'export const value=2;export function twice(value){return value*this.value;}' }
    },
    {
        name: 'reassigned callable',
        content: 'import {twice} from "./dep.js";export function probe(){return twice(21);}',
        modules: {
            'dep.js': 'export function twice(value){return value*2;}twice=value=>(console.log("replacement"),value);'
        }
    }
]
    .map(function (fixture) {
        return { ...fixture, removes: null };
    });

suite('module completion reductions', function () {
    for (const fixture of [ ...cases, ...retained ]) {
        test(`preserves ${fixture.name}`, async function () {
            const modules = await assertModuleEliminationOutput(fixture.name, fixture.content, fixture.modules);
            if (fixture.removes !== null) {
                const output = Array.from(modules.values()).join('\n');
                assert.strictEqual(output.includes(fixture.removes), false, output);
            }
        });
    }
});
