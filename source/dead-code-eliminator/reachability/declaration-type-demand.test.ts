import assert from 'node:assert';
import { suite, test } from 'mocha';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { buildReachabilityIndex } from './reachability.ts';

suite('declaration type demand', function () {
    for (const runtimeUse of [ false, true ]) {
        test(`retains a signature separately from its runtime body with runtime use ${runtimeUse}`, function () {
            const files = multiFileBindingsFor([
                {
                    filePath: '/index.js',
                    content: runtimeUse ? 'export {read} from "./library.js";' : 'export const value=42;'
                },
                {
                    filePath: '/index.d.ts',
                    content: 'import type {read} from "./library.js";export type Reader=typeof read;'
                },
                { filePath: '/library.js', content: 'export function read(){return 42;}' },
                { filePath: '/library.d.ts', content: 'export declare function read(): number;' }
            ]);
            const reachable = buildReachabilityIndex({
                bundleName: 'package',
                files,
                entryPointFilePaths: new Set([ '/index.js', '/index.d.ts' ]),
                classifySideEffects,
                trace: undefined
            })
                .localReachable;
            assert.strictEqual(reachable.has('/library.d.ts::read'), true);
            assert.strictEqual(reachable.has('/library.js::read'), runtimeUse);
        });
    }

    test('keeps a runtime source when it is the only available type provider', function () {
        const files = multiFileBindingsFor([
            { filePath: '/index.d.ts', content: 'import {read} from "./library.js";export type Reader=typeof read;' },
            { filePath: '/library.js', content: 'export function read(){return 42;}' }
        ]);
        const reachable = buildReachabilityIndex({
            bundleName: 'package',
            files,
            entryPointFilePaths: new Set([ '/index.d.ts' ]),
            classifySideEffects,
            trace: undefined
        })
            .localReachable;
        assert.strictEqual(reachable.has('/library.js::read'), true);
    });
});
