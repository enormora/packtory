import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { readModuleExportModel, type ModuleExportModel } from './module-export-model.ts';

function modelAt(content: string, filePath: string): ModuleExportModel {
    const project = createProject({ withFiles: [ { filePath, content } ] });
    return readModuleExportModel(project.getSourceFileOrThrow(filePath));
}

function model(content: string): ModuleExportModel {
    return modelAt(content, '/repo/index.js');
}

suite('module export model', function () {
    suite('mixed runtime and type metadata', function () {
        for (const content of [ 'export type {Value} from "./types.js";', 'export {type Value} from "./types.js";' ]) {
            test(`omits erased exports in ${content}`, function () {
                assert.deepStrictEqual(modelAt(content, '/repo/index.ts').entries, new Map());
            });
        }

        test('retains an opaque export assignment alongside ordinary statements', function () {
            assert.strictEqual(modelAt('export {};const value=1;export = value;', '/repo/index.ts').closed, false);
        });

        test('recognizes module syntax among unrelated statements', function () {
            assert.strictEqual(model(';export default function(){}').closed, true);
        });
    });

    test('records direct declarations and renamed local bindings', function () {
        const result = model('export const first=1;const local=2;export {local as second};');
        assert.deepStrictEqual(
            { closed: result.closed, entries: result.entries },
            {
                closed: true,
                entries: new Map([
                    [ 'first', { kind: 'local', local: 'first' } ],
                    [ 'second', { kind: 'local', local: 'local' } ]
                ])
            }
        );
        assert.deepStrictEqual(Array.from(result.locals.keys()), [ 'first', 'local' ]);
    });

    test('decodes quoted exported names and preserves forwarded names', function () {
        const result = model('export {"local name" as "public name", value as "\\u0061"} from "./library.js";');
        assert.deepStrictEqual(
            result.entries,
            new Map([
                [ 'public name', { kind: 'forward', specifier: './library.js', name: 'local name' } ],
                [ 'a', { kind: 'forward', specifier: './library.js', name: 'value' } ]
            ])
        );
    });

    test('distinguishes star exports from namespace and empty export clauses', function () {
        const result = model(
            'export * from "./star.js";export * as grouped from "./namespace.js";export {} from "./effects.js";'
        );
        assert.strictEqual(result.closed, true);
        assert.deepStrictEqual(
            result.stars.map(function (star) {
                return star.specifier;
            }),
            [ './star.js' ]
        );
        assert.deepStrictEqual(
            result.entries,
            new Map([
                [ 'grouped', { kind: 'namespace', specifier: './namespace.js' } ]
            ])
        );
    });

    test('keeps imported bindings available for later provenance resolution', function () {
        const result = model(
            'import def,{value as local} from "./library.js";import * as ns from "./namespace.js";export {def,local,ns};'
        );
        assert.deepStrictEqual(Array.from(result.locals.keys()), [ 'def', 'local', 'ns' ]);
        assert.deepStrictEqual(
            result.entries,
            new Map([
                [ 'def', { kind: 'local', local: 'def' } ],
                [ 'local', { kind: 'local', local: 'local' } ],
                [ 'ns', { kind: 'local', local: 'ns' } ]
            ])
        );
    });

    test('retains the local name of named default declarations', function () {
        assert.deepStrictEqual(
            model('export default function named(){}').entries,
            new Map([
                [ 'default', { kind: 'local', local: 'named' } ]
            ])
        );
        assert.deepStrictEqual(
            model('export default class Named{}').entries,
            new Map([
                [ 'default', { kind: 'local', local: 'Named' } ]
            ])
        );
    });

    test('records anonymous default declarations and value snapshots separately', function () {
        assert.deepStrictEqual(
            model('export default function(){}').entries,
            new Map([
                [ 'default', { kind: 'anonymous' } ]
            ])
        );
        assert.deepStrictEqual(
            model('export default class{}').entries,
            new Map([
                [ 'default', { kind: 'anonymous' } ]
            ])
        );
        assert.deepStrictEqual(
            model('const value=1;export default value;').entries,
            new Map([
                [ 'default', { kind: 'local', local: 'default' } ]
            ])
        );
    });

    test('recognizes an explicit empty module and an import-only module', function () {
        assert.strictEqual(model('export {};').closed, true);
        assert.strictEqual(model('import "./effects.js";').closed, true);
        assert.strictEqual(model('const value=1;').closed, false);
    });

    suite('opaque schemas', function () {
        const opaqueModules = [
            [ 'export const value=1;', '/repo/index.cjs' ],
            [ 'export const value=1;', '/repo/index.cts' ],
            [ 'export declare const value:number;', '/repo/index.d.ts' ],
            [ 'export declare const value:number;', '/repo/index.d.mts' ],
            [ 'export declare const value:number;', '/repo/index.ts' ],
            [ 'export interface Value{}', '/repo/index.ts' ],
            [ 'export type Value=number;', '/repo/index.ts' ],
            [ 'export type * from "./types.js";', '/repo/index.ts' ],
            [ 'export {type Value} from "./types.js";', '/repo/index.ts' ],
            [ 'import type {Value} from "./types.js";export {};', '/repo/index.ts' ],
            [ 'import {type Value} from "./types.js";export {};', '/repo/index.ts' ],
            [ 'const value=1;export = value;', '/repo/index.ts' ]
        ] as const;
        for (const [ content, filePath ] of opaqueModules) {
            test(`keeps opaque export schemas unchanged: ${content} in ${filePath}`, function () {
                assert.strictEqual(modelAt(content, filePath).closed, false);
            });
        }
    });
});
