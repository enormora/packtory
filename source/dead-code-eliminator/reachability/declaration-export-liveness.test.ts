import assert from 'node:assert';
import { suite, test } from 'mocha';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { survivingDeclarationExports } from './identifier-target-collector.ts';
import { buildReachabilityIndex } from './reachability.ts';

suite('declaration export liveness', function () {
    test('removes only named exports whose known targets are all dead', function () {
        const files = multiFileBindingsFor([
            { filePath: 'runtime.js', content: 'export const value = 1;' },
            { filePath: 'target.js', content: 'export const dead = 1;' },
            {
                filePath: 'barrel.d.ts',
                content: [
                    'export { dead, dead as alias, live as retained } from "./target.d.ts";',
                    'export type { Shape } from "./target.d.ts";',
                    'export { type Shape as Renamed } from "./target.d.ts";',
                    'export { External } from "external";',
                    'export * as namespace from "./target.d.ts";',
                    'export { local as localAlias };',
                    'declare const local: number;',
                    'export default local;'
                ]
                    .join('\n')
            },
            {
                filePath: 'target.d.ts',
                content: [
                    'export declare const dead: number;',
                    'export declare const live: number;',
                    'export type Shape = { value: string };'
                ]
                    .join('\n')
            }
        ]);
        const surviving = survivingDeclarationExports(
            files,
            new Set([
                'target.js::dead',
                'target.d.ts::live',
                'target.d.ts::Shape',
                'barrel.d.ts::local'
            ])
        );

        assert.strictEqual(surviving.has('runtime.js'), false);
        assert.deepStrictEqual(
            surviving.get('barrel.d.ts'),
            new Set([
                'retained',
                'Shape',
                'Renamed',
                'External',
                'namespace',
                'localAlias',
                'default'
            ])
        );
    });

    for (const requiresValue of [ false, true ]) {
        test(`tracks forwarding exports with typeof required: ${requiresValue}`, function () {
            const files = multiFileBindingsFor([
                {
                    filePath: 'index.d.ts',
                    content: [
                        'import type { Shape, read } from "./barrel.d.ts";',
                        'export declare function run(shape: Shape): number;',
                        requiresValue ? 'export type Reader = typeof read;' : ''
                    ]
                        .join('\n')
                },
                {
                    filePath: 'barrel.d.ts',
                    content: 'export { read } from "./target.d.ts";export type { Shape } from "./target.d.ts";'
                },
                {
                    filePath: 'target.d.ts',
                    content: 'export type Shape = { value: string };export declare function read(): string;'
                }
            ]);
            const index = buildReachabilityIndex({
                bundleName: 'package',
                files,
                entryPointFilePaths: new Set([ 'index.d.ts' ]),
                classifySideEffects,
                deadCodeElimination: undefined,
                trace: undefined
            });

            assert.deepStrictEqual(
                index.resolveWith(undefined).exports.get('barrel.d.ts'),
                new Set(requiresValue ? [ 'read', 'Shape' ] : [ 'Shape' ])
            );
        });
    }
});
