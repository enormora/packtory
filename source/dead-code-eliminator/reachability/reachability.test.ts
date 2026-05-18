import assert from 'node:assert';
import { suite, test } from 'mocha';
import { runNodeProbe } from '../../test-libraries/run-node-probe.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from './binding-extractor.ts';
import { bindingId } from './binding-id.ts';
import type { FileBindings } from './local-seed-gathering.ts';
import { buildReachabilityIndex } from './reachability.ts';

const probeTestTimeoutMs = 10_000;

function fileBindingsFor(filePath: string, content: string): FileBindings {
    const project = createProject({ withFiles: [{ filePath, content }] });
    const sourceFile = project.getSourceFileOrThrow(filePath);
    return { sourceFilePath: filePath, sourceFile, bindings: extractTopLevelBindings(sourceFile) };
}

function multiFileBindingsFor(
    files: readonly { readonly filePath: string; readonly content: string }[]
): readonly FileBindings[] {
    const project = createProject({
        withFiles: files.map((file) => ({ filePath: file.filePath, content: file.content }))
    });
    return files.map((file) => {
        const sourceFile = project.getSourceFileOrThrow(file.filePath);
        return { sourceFilePath: file.filePath, sourceFile, bindings: extractTopLevelBindings(sourceFile) };
    });
}

suite('reachability', function () {
    test('keeps every exported entry-point binding reachable', function () {
        const files = [fileBindingsFor('entry.ts', 'export function pub() {}\nexport class Pub {}')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('entry.ts', 'pub')));
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'Pub')));
    });

    test('does not keep an unexported and unused helper reachable', function () {
        const files = [fileBindingsFor('entry.ts', 'function helper() {}\nexport function pub() { return 1; }')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.strictEqual(index.localReachable.has(bindingId('entry.ts', 'helper')), false);
    });

    test('keeps an unexported helper reachable when an exported binding references it', function () {
        const files = [
            fileBindingsFor('entry.ts', 'function helper() { return 1; }\nexport function pub() { return helper(); }')
        ];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('entry.ts', 'helper')));
    });

    test('keeps the whole destructuring declarator reachable when an exported binding references one of its bindings', function () {
        const files = [
            fileBindingsFor(
                'entry.ts',
                'const { helper, other } = { helper() { return 1; }, other() { return 2; } };\nexport function pub() { return helper(); }'
            )
        ];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('entry.ts', 'helper')));
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'other')));
    });

    test('keeps a destructuring initializer reachable when an exported destructured binding is live', function () {
        const files = [
            fileBindingsFor(
                'entry.ts',
                'function createApi() { return { publish() { return 1; } }; }\nconst api = createApi();\nexport const { publish } = api;'
            )
        ];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('entry.ts', 'publish')));
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'api')));
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'createApi')));
    });

    test('keeps shorthand property value bindings reachable when an exported object literal uses them', function () {
        const files = [
            fileBindingsFor(
                'entry.ts',
                'const globalSchema = 1;\nconst perPackageSchema = 2;\nfunction run() { return 3; }\nexport const rule = { globalSchema, perPackageSchema, run };'
            )
        ];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('entry.ts', 'rule')));
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'globalSchema')));
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'perPackageSchema')));
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'run')));
    });

    test('ignores shorthand properties whose value symbol cannot be resolved', function () {
        const files = [fileBindingsFor('entry.ts', 'export const rule = { missing };')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('entry.ts', 'rule')));
        assert.strictEqual(index.localReachable.has(bindingId('entry.ts', 'missing')), false);
    });

    test('keeps cross-file imports reachable when an entry-point uses them', function () {
        const files = multiFileBindingsFor([
            {
                filePath: 'entry.ts',
                content: 'import { used } from "./helpers.ts";\nexport function pub() { return used(); }'
            },
            {
                filePath: 'helpers.ts',
                content: 'export function used() { return 1; }\nexport function unused() { return 2; }'
            }
        ]);
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('helpers.ts', 'used')));
        assert.strictEqual(index.localReachable.has(bindingId('helpers.ts', 'unused')), false);
    });

    test('keeps every binding reachable that an impure top-level statement references', function () {
        const files = [fileBindingsFor('entry.ts', 'function setup() {}\nfunction unused() {}\nsetup();')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('entry.ts', 'setup')));
        assert.strictEqual(index.localReachable.has(bindingId('entry.ts', 'unused')), false);
    });

    test('preserves helpers transitively reached through internal calls', function () {
        const content = [
            'function deep() { return 1; }',
            'function middle() { return deep(); }',
            'export function top() { return middle(); }'
        ].join('\n');
        const files = [fileBindingsFor('entry.ts', content)];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.ok(index.localReachable.has(bindingId('entry.ts', 'deep')));
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'middle')));
    });

    test('expandWith honours external seeds passed in by callers', function () {
        const files = [fileBindingsFor('lib.ts', 'export function used() {}\nexport function unused() {}')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set<string>() });
        const reachable = index.expandWith(new Set([bindingId('lib.ts', 'used')]));

        assert.ok(reachable.has(bindingId('lib.ts', 'used')));
        assert.strictEqual(reachable.has(bindingId('lib.ts', 'unused')), false);
    });

    test('returns no reachable bindings when no entry points and no external seeds are given', function () {
        const files = [fileBindingsFor('lib.ts', 'export function isolated() {}')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set<string>() });

        assert.strictEqual(index.localReachable.size, 0);
    });

    test('expandWith tolerates external seeds that do not exist in the bundle edge map', function () {
        const files = [fileBindingsFor('lib.ts', 'export function used() {}')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set<string>() });
        const reachable = index.expandWith(new Set([bindingId('not-in-bundle.ts', 'mystery')]));

        assert.ok(reachable.has(bindingId('not-in-bundle.ts', 'mystery')));
        assert.strictEqual(reachable.size, 1);
    });

    test('expandWith returns the localReachable set unchanged when given no external seeds', function () {
        const files = [fileBindingsFor('entry.ts', 'export function pub() { return 1; }')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.strictEqual(index.expandWith(undefined), index.localReachable);
        assert.strictEqual(index.expandWith(new Set<string>()), index.localReachable);
    });

    test('expandWith preserves localReachable bindings that the external seeds do not transitively reach', function () {
        const files = [
            fileBindingsFor('entry.ts', 'export function pub() { return 1; }\nexport function other() { return 2; }')
        ];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });
        const reachable = index.expandWith(new Set([bindingId('entry.ts', 'pub')]));

        assert.ok(reachable.has(bindingId('entry.ts', 'pub')));
        assert.ok(reachable.has(bindingId('entry.ts', 'other')));
    });

    test('expandWith reuses the injected visitedHas dependency', function () {
        const files = [
            fileBindingsFor(
                'entry.ts',
                'function helper() { return pub(); }\nexport function pub() { return helper(); }'
            )
        ];
        const index = buildReachabilityIndex(
            { files, entryPointFilePaths: new Set<string>() },
            {
                visitedHas(visited, value) {
                    if (typeof value === 'string' && value.includes('::')) {
                        return false;
                    }
                    return visited.has(value);
                }
            }
        );

        assert.throws(() => {
            index.expandWith(new Set([bindingId('entry.ts', 'pub')]));
        }, /^Error: Reachability traversal exceeded the maximum iteration budget$/u);
    });

    test('does not record any unresolved binding ids when a function references its own parameters', function () {
        const files = [fileBindingsFor('entry.ts', 'export function pub(x: number) { return x; }')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

        assert.strictEqual(index.localReachable.size, 1);
        assert.ok(index.localReachable.has(bindingId('entry.ts', 'pub')));
    });

    test('includes every file in bindingIdsByFile, even unreachable ones', function () {
        const files = [fileBindingsFor('isolated.ts', 'export function never() {}')];
        const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set<string>() });

        const isolatedIds = index.bindingIdsByFile.get('isolated.ts');
        assert.ok(isolatedIds !== undefined);
        assert.ok(isolatedIds.has(bindingId('isolated.ts', 'never')));
    });

    test('buildReachabilityIndex completes promptly for cyclic binding graphs', async function () {
        const result = await runNodeProbe(
            `
import { createProject } from './source/test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from './source/dead-code-eliminator/reachability/binding-extractor.ts';
import { buildReachabilityIndex } from './source/dead-code-eliminator/reachability/reachability.ts';

const project = createProject({
    withFiles: [{
        filePath: 'entry.ts',
        content: 'function helper() { return pub(); }\\nexport function pub() { return helper(); }'
    }]
});
const sourceFile = project.getSourceFileOrThrow('entry.ts');
const files = [{
    sourceFilePath: 'entry.ts',
    sourceFile,
    bindings: extractTopLevelBindings(sourceFile)
}];
const index = buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) });

console.log(JSON.stringify(Array.from(index.localReachable).toSorted()));
`,
            { timeoutMs: 8000 }
        );

        assert.deepStrictEqual(result, ['entry.ts::helper', 'entry.ts::pub']);
    }).timeout(probeTestTimeoutMs);

    test('buildReachabilityIndex throws when traversal exceeds the iteration budget', function () {
        const files = [
            fileBindingsFor(
                'entry.ts',
                'function helper() { return pub(); }\nexport function pub() { return helper(); }'
            )
        ];
        const visitedHas = <T>(visited: ReadonlySet<T>, value: T): boolean => {
            if (typeof value === 'string' && value.includes('::')) {
                return false;
            }
            return visited.has(value);
        };

        assert.throws(() => {
            buildReachabilityIndex({ files, entryPointFilePaths: new Set(['entry.ts']) }, { visitedHas });
        }, /^Error: Reachability traversal exceeded the maximum iteration budget$/u);
    });
});
