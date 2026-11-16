import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertEquivalentModules } from '../test-libraries/dead-code-elimination-module-case.ts';

const cases = [
    { body: 'return this.missing();', keepsUnused: true },
    { body: 'return this.value;', keepsUnused: false },
    { body: 'return this["value"];', keepsUnused: false },
    { body: 'const self=this;return self.value;', keepsUnused: false },
    { body: 'const {value}=this;return value;', keepsUnused: false },
    { body: 'const read=()=>this.value;return read();', keepsUnused: false },
    { body: 'return Object.keys(this);', keepsUnused: true },
    { body: 'return this;', keepsUnused: true },
    { body: 'return this[["un","used"].join("")];', keepsUnused: true },
    { body: 'return eval("Object.keys(this)");', keepsUnused: true },
    { body: 'return this.method();', keepsUnused: true },
    { body: 'return this.answer();', keepsUnused: false },
    { body: 'return this.loop(1);', keepsUnused: false }
];

suite('namespace receiver property demand', function () {
    const scenarios = cases.flatMap(function (item) {
        return [ { ...item, dynamic: false }, { ...item, dynamic: true } ];
    });
    for (const fixture of scenarios) {
        test(`preserves ${fixture.body}, dynamic ${fixture.dynamic}`, async function () {
            const modules = await assertEquivalentModules(
                fixture.body,
                fixture.dynamic
                    ? 'export async function probe(){const ns=await import("./dep.js");return ns.read();}'
                    : 'import * as ns from "./dep.js";export function probe(){return ns.read();}',
                {
                    'dep.js':
                        'export const value=42;export const unused=9;export function loop(n){return n?this.loop(n-1):this.value;}' +
                        'export function answer(){return this.value;}export function method(){return this.unused;}' +
                        `export function read(){${fixture.body}}`
                }
            );
            const source = Array.from(modules.values()).join('\n');
            assert.strictEqual(source.includes('const unused'), fixture.keepsUnused, source);
        });
    }

    test('keeps receiver demand separate for a callable forwarded into different namespaces', async function () {
        const modules = await assertEquivalentModules(
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
