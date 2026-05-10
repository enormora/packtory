import assert from 'node:assert';
import { test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from './binding-extractor.ts';
import { bindingId, computeReachability, type FileBindings } from './reachability.ts';

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

test('keeps every exported entry-point binding reachable', () => {
    const files = [fileBindingsFor('entry.ts', 'export function pub() {}\nexport class Pub {}')];
    const result = computeReachability({ files, entryPointFilePaths: new Set(['entry.ts']) });

    assert.ok(result.reachable.has(bindingId('entry.ts', 'pub')));
    assert.ok(result.reachable.has(bindingId('entry.ts', 'Pub')));
});

test('does not keep an unexported and unused helper reachable', () => {
    const files = [fileBindingsFor('entry.ts', 'function helper() {}\nexport function pub() { return 1; }')];
    const result = computeReachability({ files, entryPointFilePaths: new Set(['entry.ts']) });

    assert.strictEqual(result.reachable.has(bindingId('entry.ts', 'helper')), false);
});

test('keeps an unexported helper reachable when an exported binding references it', () => {
    const files = [
        fileBindingsFor('entry.ts', 'function helper() { return 1; }\nexport function pub() { return helper(); }')
    ];
    const result = computeReachability({ files, entryPointFilePaths: new Set(['entry.ts']) });

    assert.ok(result.reachable.has(bindingId('entry.ts', 'helper')));
});

test('keeps cross-file imports reachable when an entry-point uses them', () => {
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
    const result = computeReachability({ files, entryPointFilePaths: new Set(['entry.ts']) });

    assert.ok(result.reachable.has(bindingId('helpers.ts', 'used')));
    assert.strictEqual(result.reachable.has(bindingId('helpers.ts', 'unused')), false);
});

test('keeps every binding reachable that an impure top-level statement references', () => {
    const files = [fileBindingsFor('entry.ts', 'function setup() {}\nfunction unused() {}\nsetup();')];
    const result = computeReachability({ files, entryPointFilePaths: new Set(['entry.ts']) });

    assert.ok(result.reachable.has(bindingId('entry.ts', 'setup')));
    assert.strictEqual(result.reachable.has(bindingId('entry.ts', 'unused')), false);
});

test('preserves helpers transitively reached through internal calls', () => {
    const content = [
        'function deep() { return 1; }',
        'function middle() { return deep(); }',
        'export function top() { return middle(); }'
    ].join('\n');
    const files = [fileBindingsFor('entry.ts', content)];
    const result = computeReachability({ files, entryPointFilePaths: new Set(['entry.ts']) });

    assert.ok(result.reachable.has(bindingId('entry.ts', 'deep')));
    assert.ok(result.reachable.has(bindingId('entry.ts', 'middle')));
});

test('honours external seeds passed in by callers', () => {
    const files = [fileBindingsFor('lib.ts', 'export function used() {}\nexport function unused() {}')];
    const result = computeReachability({
        files,
        entryPointFilePaths: new Set<string>(),
        externalSeeds: new Set([bindingId('lib.ts', 'used')])
    });

    assert.ok(result.reachable.has(bindingId('lib.ts', 'used')));
    assert.strictEqual(result.reachable.has(bindingId('lib.ts', 'unused')), false);
});

test('returns no reachable bindings when no entry points and no seeds are given', () => {
    const files = [fileBindingsFor('lib.ts', 'export function isolated() {}')];
    const result = computeReachability({ files, entryPointFilePaths: new Set<string>() });

    assert.strictEqual(result.reachable.size, 0);
});

test('tolerates external seeds that do not exist in the bundle edge map', () => {
    const files = [fileBindingsFor('lib.ts', 'export function used() {}')];
    const result = computeReachability({
        files,
        entryPointFilePaths: new Set<string>(),
        externalSeeds: new Set([bindingId('not-in-bundle.ts', 'mystery')])
    });

    assert.ok(result.reachable.has(bindingId('not-in-bundle.ts', 'mystery')));
    assert.strictEqual(result.reachable.size, 1);
});

test('does not record any unresolved binding ids when a function references its own parameters', () => {
    const files = [fileBindingsFor('entry.ts', 'export function pub(x: number) { return x; }')];
    const result = computeReachability({ files, entryPointFilePaths: new Set(['entry.ts']) });

    assert.strictEqual(result.reachable.size, 1);
    assert.ok(result.reachable.has(bindingId('entry.ts', 'pub')));
});

test('includes every file in bindingIdsByFile, even unreachable ones', () => {
    const files = [fileBindingsFor('isolated.ts', 'export function never() {}')];
    const result = computeReachability({ files, entryPointFilePaths: new Set<string>() });

    const isolatedIds = result.bindingIdsByFile.get('isolated.ts');
    assert.ok(isolatedIds !== undefined);
    assert.ok(isolatedIds.has(bindingId('isolated.ts', 'never')));
});
