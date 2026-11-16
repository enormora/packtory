import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { dynamicImportProperties } from './dynamic-import-properties.ts';

const ordinaryModule = 'export const used=42;export const unused=9;';

type NamespaceObservationCase = {
    readonly name: string;
    readonly body: string;
    readonly target: string;
    readonly expected: readonly string[] | undefined;
};

function observedProperties(body: string, target: string): ReadonlySet<string> | undefined {
    const project = createProject({
        withFiles: [
            { filePath: '/repo/index.js', content: `export async function probe(){${body}}` },
            { filePath: '/repo/lazy.js', content: target }
        ]
    });
    const source = project.getSourceFileOrThrow('/repo/index.js');
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find(function (candidate) {
        return candidate.getExpression().getKind() === SyntaxKind.ImportKeyword;
    });
    assertDefined(call);
    return dynamicImportProperties(call, project.getSourceFileOrThrow('/repo/lazy.js'));
}

const ordinaryCases: readonly (readonly [string, string, readonly string[] | undefined])[] = [
    [ 'unawaited imports', 'return import("./lazy.js");', undefined ],
    [ 'discarded awaited values', 'await import("./lazy.js");return 42;', [] ],
    [ 'direct property reads', 'return (await import("./lazy.js")).used;', [ 'used' ] ],
    [ 'stable aliases', 'const ns=await import("./lazy.js");const alias=ns;return alias.used;', [ 'used' ] ],
    [ 'string keys', 'const ns=await import("./lazy.js");return ns["used"];', [ 'used' ] ],
    [ 'template keys', 'const ns=await import("./lazy.js");return ns[`used`];', [ 'used' ] ],
    [ 'numeric exponent keys', 'const ns=await import("./lazy.js");return ns[5e-324];', [ '5e-324' ] ],
    [ 'computed keys', 'const ns=await import("./lazy.js");return ns[key];', undefined ],
    [ 'namespace escape', 'const ns=await import("./lazy.js");return ns;', undefined ],
    [ 'enumeration', 'const ns=await import("./lazy.js");return Object.keys(ns);', undefined ],
    [ 'destructuring', 'const ns=await import("./lazy.js");const {used}=ns;return used;', undefined ],
    [ 'mutable bindings', 'let ns=await import("./lazy.js");ns={used:1};return ns.used;', undefined ],
    [ 'method receivers', 'const ns=await import("./lazy.js");return ns.used();', undefined ],
    [ 'optional method receivers', 'const ns=await import("./lazy.js");return ns.used?.();', undefined ],
    [ 'tagged template receivers', 'const ns=await import("./lazy.js");return ns.used`value`;', undefined ],
    [ 'property assignments', 'const ns=await import("./lazy.js");return ns.used=1;', [ 'used' ] ],
    [ 'property deletion', 'const ns=await import("./lazy.js");return delete ns.used;', [ 'used' ] ],
    [ 'captured reads', 'const ns=await import("./lazy.js");function read(){return ns.used;}return read();', [
        'used'
    ] ],
    [ 'dynamic scope', 'const ns=await import("./lazy.js");return eval("ns.used");', undefined ]
];

const moduleCases: readonly NamespaceObservationCase[] = [
    {
        name: 'ordinary callable exports',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'export function unrelated(){}export const used=42;',
        expected: [ 'used' ]
    },
    {
        name: 'receiver-free promise assimilation',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'export function then(resolve){resolve({used:42});}export const unused=9;',
        expected: [ 'then' ]
    },
    {
        name: 'arrow promise assimilation',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'export const then=resolve=>resolve({used:42});export const unused=9;',
        expected: [ 'then' ]
    },
    {
        name: 'aliased promise assimilation',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'function assimilate(resolve){resolve({used:42});}export {assimilate as then};',
        expected: [ 'then' ]
    },
    {
        name: 'promise assimilation with a receiver',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'export function then(resolve){resolve(this.unused);}export const unused=9;',
        expected: undefined
    },
    {
        name: 'mutable promise assimilation',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'export let then=resolve=>resolve({used:42});',
        expected: undefined
    },
    {
        name: 'unproved then values',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'export const then=42;export const used=1;',
        expected: undefined
    },
    {
        name: 'forwarded exports',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'export {used} from "./other.js";',
        expected: undefined
    },
    {
        name: 'local export aliases',
        body: 'const ns=await import("./lazy.js");return ns.used;',
        target: 'const value=42;export {value as used};',
        expected: [ 'used' ]
    }
];

suite('dynamic import namespace properties', function () {
    for (const [ name, body, expected ] of ordinaryCases) {
        test(`observes ${name}`, function () {
            assert.deepStrictEqual(
                observedProperties(body, ordinaryModule),
                expected === undefined ? undefined : new Set(expected)
            );
        });
    }

    for (const { name, body, target, expected } of moduleCases) {
        test(`observes ${name}`, function () {
            assert.deepStrictEqual(
                observedProperties(body, target),
                expected === undefined ? undefined : new Set(expected)
            );
        });
    }
});

suite('dynamic import receiver demand', function () {
    for (
        const [ content, names ] of [
            [ 'export const value=42;export function read(){return this.value;}', [ 'read', 'value' ] ],
            [
                'export const value=42;export function answer(){return this.value;}export function read(){return this.answer();}',
                [ 'read', 'answer', 'value' ]
            ],
            [ 'export const value=42;export function read(){return this.missing();}', undefined ],
            [ 'export const value=42;function local(){return this.value;}export{local as read};', [ 'read', 'value' ] ]
        ] as const
    ) {
        test(`follows receiver observations in ${content}`, function () {
            const fixture = createExportModuleFixture({
                'index.js': 'export async function probe(){const ns=await import("./library.js");return ns.read();}',
                'library.js': content
            }, []);
            const call = fixture.source('index.js').getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            assert.deepStrictEqual(
                dynamicImportProperties(call, fixture.source('library.js')),
                names === undefined ? undefined : new Set(names)
            );
        });
    }
});
