import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid,
    type DeadCodeEliminationOracleCase
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { LinkedBundleResource } from '../linker/linked-bundle.ts';

type NamespaceCase = {
    readonly name: string;
    readonly files: Readonly<Record<string, string>>;
    readonly retainsUnused: boolean;
};

const cases: readonly NamespaceCase[] = [
    {
        name: 'unknown target without a static import',
        files: {
            'index.js': 'export async function probe(path="./lazy.js"){return Object.keys(await import(path));}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: true
    },
    {
        name: 'unreachable unknown request does not retain module exports',
        files: {
            'index.js': 'function unused(path){return import(path);}export function probe(){return 42;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'computed import still enumerates a namespace after a static scalar read folds',
        files: {
            'index.js': 'import ns from "./wrapper.js";export async function probe(){' +
                'const path="./wrapper.js";const wrapped=await import(path);' +
                'return [ns.used,Object.keys(wrapped.default)];}',
            'dependency.js': 'export const used=42;export const unused=9;',
            'wrapper.js': 'import * as ns from "./dependency.js";export default ns;'
        },
        retainsUnused: true
    },
    {
        name: 'unknown import still enumerates a namespace after a static scalar read folds',
        files: {
            'index.js': 'import ns from "./wrapper.js";export async function probe(path="./wrapper.js"){' +
                'const wrapped=await import(path);return [ns.used,Object.keys(wrapped.default)];}',
            'dependency.js': 'export const used=42;export const unused=9;',
            'wrapper.js': 'import * as ns from "./dependency.js";export default ns;'
        },
        retainsUnused: true
    },
    {
        name: 'computed import prunes unobserved properties of a default namespace',
        files: {
            'index.js': 'import ns from "./wrapper.js";export async function probe(){' +
                'const path="./wrapper.js";const wrapped=await import(path);return [ns.used,wrapped.default.used];}',
            'dependency.js': 'export const used=42;export const unused=9;',
            'wrapper.js': 'import * as ns from "./dependency.js";export default ns;'
        },
        retainsUnused: false
    },
    {
        name: 'numeric exponent key',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns[5e-324];}',
            'lazy.js': 'const used=42;export {used as "5e-324"};export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'aliases',
        files: {
            'index.js':
                'export async function probe(){const ns=await import("./lazy.js");const alias=ns;const other=alias;return other.used;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'assignment',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns.used=3;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'computed',
        files: {
            'index.js':
                'export async function probe(){const ns=await import("./lazy.js");return ns[["un","used"].join("")];}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: true
    },
    {
        name: 'delete',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return delete ns.used;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'destructure',
        files: {
            'index.js':
                'export async function probe(){const ns=await import("./lazy.js");const {used}=ns;return used;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: true
    },
    {
        name: 'direct',
        files: {
            'index.js': 'export async function probe(){return (await import("./lazy.js")).used;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'enumeration',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return Object.keys(ns);}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: true
    },
    {
        name: 'escape',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: true
    },
    {
        name: 'eval',
        files: {
            'index.js':
                'export async function probe(){const ns=await import("./lazy.js");return eval("Object.keys(ns)");}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: true
    },
    {
        name: 'live',
        files: {
            'index.js':
                'export async function probe(){const ns=await import("./lazy.js");const increment=ns.increment;increment();return ns.used;}',
            'lazy.js': 'export let used=0;export const unused=9;export function increment(){used++;}'
        },
        retainsUnused: false
    },
    {
        name: 'method-this',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns.used();}',
            'lazy.js': 'export function used(){return this.unused;}export const unused=42;'
        },
        retainsUnused: true
    },
    {
        name: 'missing',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns.missing;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'mutable-binding',
        files: {
            'index.js': 'export async function probe(){let ns=await import("./lazy.js");ns={used:3};return ns.used;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: true
    },
    {
        name: 'optional-method-this',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns.used?.();}',
            'lazy.js': 'export function used(){return this.unused;}export const unused=42;'
        },
        retainsUnused: true
    },
    {
        name: 'parentheses',
        files: {
            'index.js': 'export async function probe(){const ns=(await import("./lazy.js"));return (ns).used;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'property',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns.used;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'returned-closure',
        files: {
            'index.js':
                'export async function probe(){const ns=await import("./lazy.js");function read(){return ns.used;}return read();}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'shadowed',
        files: {
            'index.js':
                'export async function probe(){const ns=await import("./lazy.js");function read(ns){return ns.unused;}return read({unused:1})+ns.used;}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'shorthand',
        files: {
            'index.js':
                'export async function probe(){const ns=await import("./lazy.js");return Object.keys(({ns}).ns);}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: true
    },
    {
        name: 'star',
        files: {
            'dep.js': 'export const used=42;export const unused=9;',
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns.used;}',
            'lazy.js': 'export * from "./dep.js";'
        },
        retainsUnused: true
    },
    {
        name: 'star-conflict',
        files: {
            'a.js': 'export const clash=1;export const used=42;',
            'b.js': 'export const clash=2;export const unused=9;',
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return [ns.clash,ns.used];}',
            'lazy.js': 'export * from "./a.js";export * from "./b.js";'
        },
        retainsUnused: true
    },
    {
        name: 'string-key',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns["used"];}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'tagged-this',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns.used`x`;}',
            'lazy.js': 'export function used(){return this.unused;}export const unused=42;'
        },
        retainsUnused: true
    },
    {
        name: 'template-key',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns[`used`];}',
            'lazy.js': 'export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'then',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return ns.used;}',
            'lazy.js':
                'export const unused=42;export function then(resolve){console.log("then");resolve({used:unused});}'
        },
        retainsUnused: true
    },
    {
        name: 'then resolves a separate object',
        files: {
            'index.js': 'export async function probe(){return (await import("./lazy.js")).used;}',
            'lazy.js': 'export const unused=9;export function then(resolve){console.log("then");resolve({used:42});}'
        },
        retainsUnused: false
    },
    {
        name: 'then arrow resolves a separate object',
        files: {
            'index.js': 'export async function probe(){return (await import("./lazy.js")).used;}',
            'lazy.js': 'export const unused=9;export const then=resolve=>resolve({used:42});'
        },
        retainsUnused: false
    },
    {
        name: 'then observes the namespace receiver',
        files: {
            'index.js': 'export async function probe(){return (await import("./lazy.js")).used;}',
            'lazy.js': 'export const unused=9;export function then(resolve){resolve({used:Object.keys(this)});}'
        },
        retainsUnused: true
    },
    {
        name: 'then observes the namespace receiver through eval',
        files: {
            'index.js': 'export async function probe(){return (await import("./lazy.js")).used;}',
            'lazy.js': 'export const unused=9;export function then(resolve){resolve({used:eval("Object.keys(this)")});}'
        },
        retainsUnused: true
    },
    {
        name: 'noncallable then still exposes the namespace',
        files: {
            'index.js': 'export async function probe(){return Object.keys(await import("./lazy.js"));}',
            'lazy.js': 'export const unused=9;export const then=42;'
        },
        retainsUnused: true
    },
    {
        name: 'reassigned then observes the namespace receiver',
        files: {
            'index.js': 'export async function probe(){return (await import("./lazy.js")).used;}',
            'lazy.js': 'export const unused=9;export let then=resolve=>resolve({used:42});' +
                'then=function(resolve){resolve({used:Object.keys(this)});};'
        },
        retainsUnused: true
    },
    {
        name: 'unused',
        files: {
            'index.js': 'export async function probe(){await import("./lazy.js");return 7;}',
            'lazy.js': 'console.log("evaluate");export const used=42;export const unused=9;'
        },
        retainsUnused: false
    },
    {
        name: 'wrapped-method-this',
        files: {
            'index.js': 'export async function probe(){const ns=await import("./lazy.js");return (ns.used)();}',
            'lazy.js': 'export function used(){return this.unused;}export const unused=42;'
        },
        retainsUnused: true
    }
];

function withDependencies(resource: LinkedBundleResource): LinkedBundleResource {
    return {
        ...resource,
        directDependencies: new Set(resource.moduleReferences.flatMap(function (reference) {
            return reference.type === 'local-code' ? [ reference.targetFilePath ] : [];
        }))
    };
}

function oracleCase(fixture: NamespaceCase): DeadCodeEliminationOracleCase {
    const content = fixture.files['index.js'];
    assertDefined(content);
    const extraResources = Object
        .entries(fixture.files)
        .filter(function ([ path ]) {
            return path !== 'index.js';
        })
        .map(function ([ targetFilePath, moduleContent ]) {
            return {
                ...bundleResource(`/source/${targetFilePath}`, { content: moduleContent, targetFilePath }),
                isSubstituted: false
            };
        });
    const bundle = bundleForCodeFile({
        name: 'package',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content,
        extraResources
    });
    return {
        name: fixture.name,
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
        eliminationInputs: inputs({ ...bundle, contents: bundle.contents.map(withDependencies) })
    };
}

suite('dynamic import property demand', function () {
    for (const fixture of cases) {
        test(`preserves ${fixture.name}`, async function () {
            const input = oracleCase(fixture);
            await assertDeadCodeEliminationEquivalent(input);
            const [ output ] = await eliminateDeadCodeAndAssertAllOutputValid(input);
            assertDefined(output);
            const retainsUnused = output.contents.some(function (resource) {
                const source = createProject().createSourceFile('output.js', resource.fileDescription.content);
                return source.getVariableDeclaration('unused') !== undefined;
            });
            assert.strictEqual(retainsUnused, fixture.retainsUnused);
        });
    }
});
