import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Project, SourceFile } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { exportPurityForOrigin, type ExportPurity } from './external-purity-summary.ts';

type TestFile = {
    readonly filePath: string;
    readonly content: string;
};

function containingSourceFile(files: readonly TestFile[]): SourceFile {
    return createProject({
        withFiles: [
            { filePath: '/project/src/index.ts', content: 'import { z } from "schema-lib";\nexport { z };' },
            {
                filePath: '/project/node_modules/schema-lib/package.json',
                content: '{"type":"module","exports":"./index.js"}'
            },
            ...files
        ]
    })
        .getSourceFileOrThrow('/project/src/index.ts');
}

function projectWithSchemaLib(content: string): Project {
    return createProject({
        withFiles: [
            { filePath: '/project/src/index.ts', content: 'import { z } from "schema-lib";\nexport { z };' },
            {
                filePath: '/project/node_modules/schema-lib/package.json',
                content: '{"type":"module","exports":"./index.js"}'
            },
            { filePath: '/project/node_modules/schema-lib/index.js', content }
        ]
    });
}

function purityFor(path: readonly string[], files: readonly TestFile[]): ExportPurity {
    return exportPurityForOrigin(
        { from: 'schema-lib', path },
        containingSourceFile(files)
    );
}

function reexportFiles(): readonly TestFile[] {
    return [
        {
            filePath: '/project/node_modules/schema-lib/index.js',
            content: [
                'export { z as renamed } from "./inner.js";',
                'export * from "./star.js";',
                'export * as namespace from "./namespace.js";',
                'import * as local from "./local.js";',
                'export { local };'
            ]
                .join('\n')
        },
        {
            filePath: '/project/node_modules/schema-lib/inner.js',
            content: [
                'export const z = { object() { return {}; } };',
                'export const other = { object() { return {}; } };'
            ]
                .join('\n')
        },
        {
            filePath: '/project/node_modules/schema-lib/star.js',
            content: 'export const star = { object() { return {}; } };'
        },
        {
            filePath: '/project/node_modules/schema-lib/namespace.js',
            content: 'export const nested = { object() { return {}; } };'
        },
        {
            filePath: '/project/node_modules/schema-lib/local.js',
            content: 'export const nested = { object() { return {}; } };'
        }
    ];
}

suite('external purity summary', function () {
    suite('local exports', function () {
        test('exportPurityForOrigin summarizes object builder surfaces and returned object methods', function () {
            const files = [ {
                filePath: '/project/node_modules/schema-lib/index.js',
                content: [
                    'export const z = {',
                    '  string() { return {}; },',
                    '  object(shape) { return { extend(extra) { return {}; } }; }',
                    '};'
                ]
                    .join('\n')
            } ];

            assert.strictEqual(purityFor([ 'z' ], files), 'pure-object');
            assert.strictEqual(purityFor([ 'z', 'string' ], files), 'pure-callable');
            assert.strictEqual(purityFor([ 'z', 'object', 'extend' ], files), 'pure-callable');
        });

        test('exportPurityForOrigin summarizes string-named properties and arrow function exports', function () {
            const files = [ {
                filePath: '/project/node_modules/schema-lib/index.js',
                content: [
                    'export const z = { "object": () => ({ extend() { return {}; } }) };',
                    'export const build = () => ({});'
                ]
                    .join('\n')
            } ];

            assert.strictEqual(purityFor([ 'z', 'object' ], files), 'pure-callable');
            assert.strictEqual(purityFor([ 'z', 'object', 'extend' ], files), 'pure-callable');
            assert.strictEqual(purityFor([ 'build' ], files), 'pure-callable');
        });

        test('exportPurityForOrigin summarizes object-valued properties and function expression returns', function () {
            const files = [ {
                filePath: '/project/node_modules/schema-lib/index.js',
                content: [
                    'export const z = {',
                    '  nested: {},',
                    '  object: function () { return { extend() { return []; } }; },',
                    '  empty() {}',
                    '};'
                ]
                    .join('\n')
            } ];

            assert.strictEqual(purityFor([ 'z', 'nested' ], files), 'pure-object');
            assert.strictEqual(purityFor([ 'z', 'object' ], files), 'pure-callable');
            assert.strictEqual(purityFor([ 'z', 'object', 'extend' ], files), 'pure-callable');
            assert.strictEqual(purityFor([ 'z', 'empty' ], files), 'unknown');
        });

        test('exportPurityForOrigin summarizes function declarations and annotations', function () {
            const files = [ {
                filePath: '/project/node_modules/schema-lib/index.js',
                content: [
                    'export function literal() { return true; }',
                    'export function declared();',
                    'export function empty() {}',
                    'export function computed() { return compute(); }',
                    'export function annotated() { /* @__NO_SIDE_EFFECTS__ */ return compute(); }'
                ]
                    .join('\n')
            } ];

            assert.strictEqual(purityFor([ 'literal' ], files), 'pure-callable');
            assert.strictEqual(purityFor([ 'declared' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'empty' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'computed' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'annotated' ], files), 'pure-callable');
        });
    });

    suite('re-exports', function () {
        test('exportPurityForOrigin follows named and star re-exports', function () {
            const files = reexportFiles();

            assert.strictEqual(purityFor([], files), 'unknown');
            assert.strictEqual(purityFor([ 'renamed' ], files), 'pure-object');
            assert.strictEqual(purityFor([ 'renamed', 'object' ], files), 'pure-callable');
            assert.strictEqual(purityFor([ 'renamed', 'her' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'renamed', 'star' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'star' ], files), 'pure-object');
            assert.strictEqual(purityFor([ 'star', 'object' ], files), 'pure-callable');
        });

        test('exportPurityForOrigin follows namespace and local namespace re-exports', function () {
            const files = reexportFiles();

            assert.strictEqual(purityFor([ 'namespace' ], files), 'pure-object');
            assert.strictEqual(purityFor([ 'namespace', 'nested', 'object' ], files), 'pure-callable');
            assert.strictEqual(purityFor([ 'local' ], files), 'pure-object');
            assert.strictEqual(purityFor([ 'local', 'nested', 'object' ], files), 'pure-callable');
        });

        test('exportPurityForOrigin keeps unsupported exports unknown', function () {
            const files = [ {
                filePath: '/project/node_modules/schema-lib/index.js',
                content: [
                    'export const z = { value: 1, ...extra };',
                    'export const count = 1;',
                    'export let missingInitializer;',
                    'const hidden = () => ({});',
                    'export { hidden as visible };'
                ]
                    .join('\n')
            } ];

            assert.strictEqual(purityFor([ 'z', 'value' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'z', 'anything' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'count' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'missingInitializer' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'S' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'visible' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'missing' ], files), 'unknown');
        });

        test('exportPurityForOrigin keeps missing re-exports unknown', function () {
            const files = [ {
                filePath: '/project/node_modules/schema-lib/index.js',
                content: [
                    'export { z } from "./missing.js";',
                    'import * as local from "./also-missing.js";',
                    'export { local };'
                ]
                    .join('\n')
            } ];

            assert.strictEqual(purityFor([ 'z' ], files), 'unknown');
            assert.strictEqual(purityFor([ 'local', 'z' ], files), 'unknown');
        });

        test('exportPurityForOrigin records missing named module re-exports as unknown', function () {
            const files = [
                {
                    filePath: '/project/node_modules/schema-lib/index.js',
                    content: 'export { missing as visible } from "./inner.js";'
                },
                {
                    filePath: '/project/node_modules/schema-lib/inner.js',
                    content: 'export const z = { object() { return {}; } };'
                }
            ];

            assert.strictEqual(purityFor([ 'visible' ], files), 'unknown');
        });
    });

    suite('fallbacks and cache', function () {
        test('exportPurityForOrigin returns unknown when the package cannot be resolved', function () {
            const containing = createProject({
                withFiles: [ { filePath: '/project/src/index.ts', content: 'import { z } from "missing-lib";' } ]
            })
                .getSourceFileOrThrow('/project/src/index.ts');

            assert.strictEqual(exportPurityForOrigin({ from: 'missing-lib', path: [ 'z' ] }, containing), 'unknown');
        });

        test('exportPurityForOrigin reuses the cached source-file summary', function () {
            const project = projectWithSchemaLib('export const z = { object() { return {}; } };');
            const containing = project.getSourceFileOrThrow('/project/src/index.ts');
            const implementation = project.getSourceFileOrThrow('/project/node_modules/schema-lib/index.js');

            assert.strictEqual(
                exportPurityForOrigin({ from: 'schema-lib', path: [ 'z', 'object' ] }, containing),
                'pure-callable'
            );
            implementation.replaceWithText('export const z = { object() { return compute(); } };');
            assert.strictEqual(
                exportPurityForOrigin({ from: 'schema-lib', path: [ 'z', 'object' ] }, containing),
                'pure-callable'
            );
        });
    });
});
