/* eslint-disable node/no-sync -- exercises the ts-morph synchronous file-system interface */
import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { createDelegatingFileSystemHost } from '../test-libraries/delegating-file-system-host.ts';
import { createNodeModulesManifestSynthesizingHost } from './node-modules-manifest-synthesizer.ts';

function nodeModulesManifestPath(packageName: string): string {
    return path.join('/project', 'node_modules', packageName, 'package.json');
}

async function readBothWays(filePath: string, content: string): Promise<readonly [string, string]> {
    const host = createNodeModulesManifestSynthesizingHost(
        createDelegatingFileSystemHost(new Map([ [ filePath, content ] ]))
    );
    return [ host.readFileSync(filePath), await host.readFile(filePath) ];
}

type RewriteCase = {
    readonly title: string;
    readonly inputExports: unknown;
    readonly expectedExports: unknown;
    readonly expectedConditionKeyOrder?: readonly string[];
};

const rewriteCases: readonly RewriteCase[] = [
    {
        title: 'injects a types condition mirroring import when the conditions object lacks one',
        inputExports: { '.': { import: './lib/index.js' } },
        expectedExports: { '.': { types: './lib/index.js', import: './lib/index.js' } },
        expectedConditionKeyOrder: [ 'types', 'import' ]
    },
    {
        title: 'falls back to the default condition when no import condition exists',
        inputExports: { '.': { default: './lib/index.js' } },
        expectedExports: { '.': { types: './lib/index.js', default: './lib/index.js' } }
    },
    {
        title: 'prefers the import condition when both import and default are present',
        inputExports: { '.': { import: './lib/import.js', default: './lib/default.js' } },
        expectedExports: {
            '.': { types: './lib/import.js', import: './lib/import.js', default: './lib/default.js' }
        }
    },
    {
        title: 'leaves the manifest untouched when an explicit types condition is already present',
        inputExports: { '.': { types: './lib/index.d.ts', import: './lib/index.js' } },
        expectedExports: { '.': { types: './lib/index.d.ts', import: './lib/index.js' } }
    },
    {
        title: 'walks nested subpath exports and synthesizes types per condition object',
        inputExports: {
            '.': { import: './lib/index.js' },
            './sub': { import: './lib/sub.js' }
        },
        expectedExports: {
            '.': { types: './lib/index.js', import: './lib/index.js' },
            './sub': { types: './lib/sub.js', import: './lib/sub.js' }
        }
    },
    {
        title: 'does not inject types at a level whose import points at a nested conditions object',
        inputExports: { '.': { import: { node: './lib/node.js' } } },
        expectedExports: { '.': { import: { node: './lib/node.js' } } }
    },
    {
        title: 'leaves a conditions object with only non-import non-default keys untouched',
        inputExports: { '.': { require: './lib/cjs.js' } },
        expectedExports: { '.': { require: './lib/cjs.js' } }
    },
    {
        title: 'preserves null condition values used to deny subpaths',
        inputExports: { '.': { import: './lib/index.js' }, './deny': null },
        expectedExports: { '.': { types: './lib/index.js', import: './lib/index.js' }, './deny': null }
    }
];

type PassthroughCase = {
    readonly title: string;
    readonly filePath: string;
    readonly content: string;
};

const passthroughCases: readonly PassthroughCase[] = [
    {
        title: 'does not modify manifests without an exports field',
        filePath: nodeModulesManifestPath('main-only-module'),
        content: JSON.stringify({ name: 'main-only-module', main: './lib/index.js' })
    },
    {
        title: 'passes through reads for package.json paths outside node_modules unchanged',
        filePath: '/project/src/package.json',
        content: JSON.stringify({ exports: { '.': { import: './lib/index.js' } } })
    },
    {
        title: 'passes through reads for non-manifest files inside node_modules',
        filePath: path.join('/project', 'node_modules', 'something', 'index.js'),
        content: 'export const example = "example";\n'
    },
    {
        title:
            'passes through reads for non-package.json JSON files inside node_modules even when they contain an exports field',
        filePath: path.join('/project', 'node_modules', 'something', 'data.json'),
        content: JSON.stringify({ exports: { '.': { import: './lib/index.js' } } })
    },
    {
        title: 'returns trailing-comma manifests unchanged so ts-morph can surface its own resolution error',
        filePath: nodeModulesManifestPath('trailing-comma-module'),
        content: '{\n    "types": "index.d.ts",\n}\n'
    },
    {
        title: 'returns non-object JSON manifests unchanged',
        filePath: nodeModulesManifestPath('array-module'),
        content: '[1, 2, 3]'
    },
    {
        title: 'returns string-content JSON manifests unchanged',
        filePath: nodeModulesManifestPath('string-content-module'),
        content: '"just a string"'
    }
];

function assertConditionKeyOrder(
    parsedExports: unknown,
    expectedConditionKeyOrder: readonly string[] | undefined
): void {
    if (expectedConditionKeyOrder === undefined) {
        return;
    }
    const subpath = (parsedExports as Record<string, Record<string, unknown>>)['.'];
    if (subpath === undefined) {
        assert.fail('expected root export subpath');
    }
    assert.deepStrictEqual(Object.keys(subpath), expectedConditionKeyOrder);
}

suite('node-modules-manifest-synthesizer', function () {
    suite('rewrites', function () {
        for (const testCase of rewriteCases) {
            test(testCase.title, async function () {
                const filePath = nodeModulesManifestPath('test-module');
                const content = JSON.stringify({ exports: testCase.inputExports });
                const [ synchronous, asynchronous ] = await readBothWays(filePath, content);

                const parsedSync = JSON.parse(synchronous) as Record<string, unknown>;
                const parsedAsync = JSON.parse(asynchronous) as Record<string, unknown>;

                assert.deepStrictEqual(parsedSync.exports, testCase.expectedExports);
                assert.deepStrictEqual(parsedAsync.exports, testCase.expectedExports);
                assertConditionKeyOrder(parsedSync.exports, testCase.expectedConditionKeyOrder);
            });
        }
    });

    suite('passthroughs', function () {
        for (const testCase of passthroughCases) {
            test(testCase.title, async function () {
                const [ synchronous, asynchronous ] = await readBothWays(testCase.filePath, testCase.content);
                assert.strictEqual(synchronous, testCase.content);
                assert.strictEqual(asynchronous, testCase.content);
            });
        }
    });
});
