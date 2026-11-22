import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertModuleEliminationOutput } from '../test-libraries/dead-code-elimination-module-case.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createNamespaceCallProperties } from './exports/namespace-call-properties.ts';
import { bindingValueIsStable } from './binding-stability.ts';

const cases = [
    { body: 'return this.missing();', properties: undefined },
    { body: 'return this.value;', properties: [ 'value' ] },
    { body: 'return this["value"];', properties: [ 'value' ] },
    { body: 'const self=this;return self.value;', properties: [ 'value' ] },
    { body: 'const {value}=this;return value;', properties: [ 'value' ] },
    { body: 'const read=()=>this.value;return read();', properties: [ 'value' ] },
    { body: 'return Object.keys(this);', properties: undefined },
    { body: 'return this;', properties: undefined },
    { body: 'return this[["un","used"].join("")];', properties: undefined },
    { body: 'return eval("Object.keys(this)");', properties: undefined },
    { body: 'return this.method();', properties: [ 'method', 'unused' ] },
    { body: 'return this.answer();', properties: [ 'answer', 'value' ] },
    { body: 'return this.loop(1);', properties: [ 'loop', 'value' ] }
];

suite('namespace receiver property demand', function () {
    for (const fixture of cases) {
        test(`observes receiver properties in ${fixture.body}`, function () {
            const source = createProject().createSourceFile(
                'dep.js',
                [
                    'export const value=42;export const unused=9;',
                    'export function loop(n){return n?this.loop(n-1):this.value;}',
                    'export function answer(){return this.value;}export function method(){return this.unused;}',
                    `export function read(){${fixture.body}}`
                ]
                    .join('')
            );
            const properties = createNamespaceCallProperties(function (name) {
                return source.getFunction(name);
            }, bindingValueIsStable)('read');
            assert.deepStrictEqual(
                properties,
                fixture.properties === undefined ? undefined : new Set(fixture.properties)
            );
        });
    }

    for (const dynamic of [ false, true ]) {
        test(`prunes unobserved receiver exports with dynamic import ${dynamic}`, async function () {
            const modules = await assertModuleEliminationOutput(
                'receiver export pruning',
                dynamic
                    ? 'export async function probe(){const ns=await import("./dep.js");return ns.read();}'
                    : 'import * as ns from "./dep.js";export function probe(){return ns.read();}',
                {
                    'dep.js':
                        'export const value=42;export const unused=9;export function loop(n){return n?this.loop(n-1):this.value;}' +
                        'export function answer(){return this.value;}export function method(){return this.unused;}' +
                        'export function read(){return this.value;}'
                }
            );
            const output = Array.from(modules.values()).join('\n');
            assert.strictEqual(output.includes('const value'), true);
            assert.strictEqual(output.includes('const unused'), false);
        });
    }

    test('keeps receiver demand separate for a callable forwarded into different namespaces', async function () {
        const modules = await assertModuleEliminationOutput(
            'forwarded receiver',
            'import * as a from "./a.js";import * as b from "./b.js";export function probe(){return [a.read(),b.read()];}',
            {
                'shared.js': 'export function read(){return this.choose();}',
                'a.js':
                    'export {read} from "./shared.js";export const first=42;export const unused=9;export function choose(){return this.first;}',
                'b.js':
                    'export {read} from "./shared.js";export const second=43;export const unused=9;export function choose(){return this.second;}'
            }
        );
        for (const content of modules.values()) {
            assert.strictEqual(content.includes('const unused'), false);
        }
    });
});
