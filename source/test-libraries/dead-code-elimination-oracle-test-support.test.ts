import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';
import { assertDeadCodeEliminationBehaviorEquivalent } from './dead-code-elimination-oracle-test-support.ts';

function bundle(content: string): LinkedBundle {
    const resource = bundleResource('/source/index.js', { content });
    return linkedBundle({
        name: 'package',
        contents: [ { ...resource, isSubstituted: false } ],
        roots: { main: { javaScript: resource.fileDescription } }
    });
}

async function compare(left: string, right: string): Promise<void> {
    await assertDeadCodeEliminationBehaviorEquivalent({
        name: 'oracle regression',
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'api' },
        leftName: 'original',
        leftBundles: [ bundle(left) ],
        rightName: 'changed',
        rightBundles: [ bundle(right) ]
    });
}

const api = 'export function api() { return 42; }';
const event = 'globalThis.__packtoryDeadCodeEliminationEvents.push("effect");';

suite('dead code elimination semantic oracle', function () {
    this.timeout(30_000);

    const differences = [
        [ 'public export loss', `${api} export const unused = 1;`, api ],
        [ 'public value changes', `${api} export const extra = 1;`, `${api} export const extra = 2;` ],
        [ 'undefined versus null', 'export const api = undefined;', 'export const api = null;' ],
        [ 'negative zero', 'export const api = -0;', 'export const api = 0;' ],
        [ 'nonfinite numbers', 'export const api = NaN;', 'export const api = Infinity;' ],
        [ 'bigints', 'export const api = 1n;', 'export const api = 2n;' ],
        [ 'sparse array length', 'export const api = [,];', 'export const api = [];' ],
        [ 'evaluation effects', `${event} ${api}`, api ],
        [ 'exceptions versus success', `${event} throw new TypeError(); ${api}`, `${event} ${api}` ],
        [ 'exception classes', 'throw new TypeError();', 'throw new RangeError();' ],
        [ 'effects before exceptions', `${event} throw new TypeError();`, 'throw new TypeError();' ],
        [ 'console output', `console.log("first"); ${api}`, `console.log("second"); ${api}` ],
        [
            'getters',
            `${api} export const extra = { get value() { ${event} return 1; } };`,
            `${api} export const extra = { value: 1 };`
        ],
        [
            'object identity',
            'const a = {}; export { a }; export function api() { return a; }',
            'export const a = {}; export function api() { return {}; }'
        ],
        [
            'live bindings',
            'export let value = 1; export function api() { value++; }',
            'export let value = 1; export function api() {}'
        ],
        [ 'dynamic import timing', `export async function api() { ${event} await Promise.resolve(); return 42; }`, api ]
    ] as const;

    for (const [ name, left, right ] of differences) {
        test(`rejects ${name}`, async function () {
            await assert.rejects(compare(left, right), /changed observable behavior/u);
        });
    }

    test('rejects a missing selected export even when both sides omit it', async function () {
        await assert.rejects(compare('export {};', 'export {};'), /missing selected export api/u);
    });

    test('accepts an explicitly undefined selected export', async function () {
        await compare('export const api = undefined;', 'export const api = undefined;');
    });

    test('accepts equal exceptions and preserves preceding effects and console output', async function () {
        const content = `console.warn("warning"); ${event} throw new TypeError();`;
        await compare(content, content);
    });

    test('rejects a missing secondary root even when its original evaluation throws', async function () {
        const left = bundle(api);
        const secondary = bundleResource('/source/secondary.js', { content: 'throw new Error();' });
        const roots = { ...left.roots, secondary: { javaScript: secondary.fileDescription } };
        await assert.rejects(
            assertDeadCodeEliminationBehaviorEquivalent({
                name: 'missing secondary root',
                entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'api' },
                leftName: 'original',
                leftBundles: [ { ...left, roots, contents: [ ...left.contents, secondary ] } ],
                rightName: 'changed',
                rightBundles: [ { ...left, roots } ]
            }),
            /secondary\.js#api missing observed entry file/u
        );
    });

    test('observes all configured roots independently', async function () {
        const left = bundle(api);
        const secondary = bundleResource('/source/secondary.js', { content: 'export const extra = 1;' });
        const right = bundleResource('/source/secondary.js', { content: 'export const extra = 2;' });
        const roots = { ...left.roots, secondary: { javaScript: secondary.fileDescription } };
        await assert.rejects(
            assertDeadCodeEliminationBehaviorEquivalent({
                name: 'multiple roots',
                entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'api' },
                leftName: 'original',
                leftBundles: [ { ...left, roots, contents: [ ...left.contents, secondary ] } ],
                rightName: 'changed',
                rightBundles: [ { ...left, roots, contents: [ ...left.contents, right ] } ]
            }),
            /secondary\.js#api changed observable behavior/u
        );
    });
});
