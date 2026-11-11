import assert from 'node:assert';
import { suite, test } from 'mocha';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { buildReachabilityIndex, type ReachabilityIndex } from './reachability.ts';

function reachabilityFor(
    contents: Readonly<Record<string, string>>,
    publicPaths: readonly string[]
): ReachabilityIndex {
    return buildReachabilityIndex({
        bundleName: 'package',
        files: multiFileBindingsFor(
            Object.entries(contents).map(function ([ filePath, content ]) {
                return { filePath, content };
            })
        ),
        entryPointFilePaths: new Set(publicPaths),
        deadCodeElimination: undefined,
        classifySideEffects,
        trace: undefined
    });
}

suite('export and binding reachability', function () {
    test('keeps graph nodes out of the public binding sets', function () {
        const index = reachabilityFor({ 'index.js': 'export const value=42;' }, [ 'index.js' ]);
        const result = index.resolveWith(undefined);
        assert.deepStrictEqual(index.localReachable, new Set([ 'index.js::value' ]));
        assert.deepStrictEqual(result, {
            bindings: index.localReachable,
            exports: new Map([ [ 'index.js', new Set([ 'value' ]) ] ])
        });
    });

    test('external export aliases retain their local bindings and export names', function () {
        const index = reachabilityFor({ 'index.js': 'const local=42;export {local as exposed};' }, []);
        const result = index.resolveWith(new Set([ 'index.js::exposed' ]));
        assert.ok(result.bindings.has('index.js::local'));
        assert.deepStrictEqual(result.exports, new Map([ [ 'index.js', new Set([ 'exposed' ]) ] ]));
        assert.strictEqual(result.bindings.has('index.js::@export:"exposed"'), false);
    });

    test('external reexports retain the complete forwarding path', function () {
        const index = reachabilityFor({
            'index.js': 'export {value as exposed} from "./library.js";',
            'library.js': 'export const value=42;export const unused=9;'
        }, []);
        const result = index.resolveWith(new Set([ 'index.js::exposed' ]));
        assert.ok(result.bindings.has('library.js::value'));
        assert.strictEqual(result.bindings.has('library.js::unused'), false);
        assert.deepStrictEqual(
            result.exports,
            new Map([
                [ 'index.js', new Set([ 'exposed' ]) ],
                [ 'library.js', new Set([ 'value' ]) ]
            ])
        );
    });

    test('external seeds evaluate module-link requirements', function () {
        const index = reachabilityFor({
            'index.js': 'import {missing} from "./library.js";export const value=42;',
            'library.js': 'export const other=9;'
        }, []);
        assert.ok(index.resolveWith(new Set([ 'index.js::value' ])).bindings.has('index.js::missing'));
    });

    test('ignores namespace observations in unreachable exported functions', function () {
        const index = reachabilityFor({
            'index.js': 'export {probe} from "./wrapper.js";',
            'wrapper.js':
                'import * as ns from "./library.js";export function probe(){return ns.used;}export function inspect(){return Object.keys(ns);}',
            'library.js': 'export const used=42;export const unused=9;'
        }, [ 'index.js' ]);
        const result = index.resolveWith(undefined);
        assert.strictEqual(result.bindings.has('wrapper.js::inspect'), false);
        assert.strictEqual(result.bindings.has('library.js::unused'), false);
        assert.deepStrictEqual(result.exports.get('library.js'), new Set([ 'used' ]));
    });

    test('external seeds restore observations excluded from local reachability', function () {
        const index = reachabilityFor({
            'index.js': 'export {probe} from "./wrapper.js";',
            'wrapper.js':
                'import * as ns from "./library.js";export function probe(){return ns.used;}export function inspect(){return Object.keys(ns);}',
            'library.js': 'export const used=42;export const unused=9;'
        }, [ 'index.js' ]);
        const result = index.resolveWith(new Set([ 'wrapper.js::inspect' ]));
        assert.ok(result.bindings.has('wrapper.js::inspect'));
        assert.ok(result.bindings.has('library.js::unused'));
        assert.deepStrictEqual(result.exports.get('library.js'), new Set([ 'used', 'unused' ]));
        assert.strictEqual(index.localReachable.has('library.js::unused'), false);
        assert.strictEqual(index.resolveWith(undefined).bindings.has('wrapper.js::inspect'), false);
    });
});
