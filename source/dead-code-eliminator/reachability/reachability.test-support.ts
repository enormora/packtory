import assert from 'node:assert';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from './binding-extractor.ts';
import { bindingId } from './binding-id.ts';
import type { FileBindings } from './local-seed-gathering.ts';
import { buildReachabilityIndex, type ReachabilityIndex } from './reachability.ts';

export const probeTestTimeoutMs = 10_000;

export function fileBindingsFor(filePath: string, content: string): FileBindings {
    const project = createProject({ withFiles: [ { filePath, content } ] });
    const sourceFile = project.getSourceFileOrThrow(filePath);
    return { sourceFilePath: filePath, sourceFile, bindings: extractTopLevelBindings(sourceFile) };
}

export function multiFileBindingsFor(
    files: readonly { readonly filePath: string; readonly content: string; }[]
): readonly FileBindings[] {
    const project = createProject({
        withFiles: files.map(function (file) {
            return { filePath: file.filePath, content: file.content };
        })
    });
    return files.map(function (file) {
        const sourceFile = project.getSourceFileOrThrow(file.filePath);
        return { sourceFilePath: file.filePath, sourceFile, bindings: extractTopLevelBindings(sourceFile) };
    });
}

export function reachabilityForReExportTarget(entryPointExportDeclaration: string): ReachabilityIndex {
    const files = multiFileBindingsFor([
        {
            filePath: 'entry.ts',
            content: entryPointExportDeclaration
        },
        {
            filePath: 'target.ts',
            content: [
                'function helper() { return 1; }',
                'export function used() { return helper(); }',
                'export function unused() { return 2; }'
            ]
                .join('\n')
        }
    ]);
    return buildReachabilityIndex({ files, entryPointFilePaths: new Set([ 'entry.ts' ]) });
}

export function reachabilityForLocalValueExport(entryPointExportDeclaration: string): ReachabilityIndex {
    const files = [
        fileBindingsFor(
            'entry.ts',
            [
                'function buildValue() { return 1; }',
                'const localValue = buildValue();',
                'const unusedValue = 2;',
                entryPointExportDeclaration
            ]
                .join('\n')
        )
    ];
    return buildReachabilityIndex({ files, entryPointFilePaths: new Set([ 'entry.ts' ]) });
}

export function assertReExportTargetIsReachable(index: ReachabilityIndex): void {
    assert.ok(index.localReachable.has(bindingId('target.ts', 'used')));
    assert.ok(index.localReachable.has(bindingId('target.ts', 'helper')));
    assert.strictEqual(index.localReachable.has(bindingId('target.ts', 'unused')), false);
}

export function assertLocalValueExportIsReachable(index: ReachabilityIndex): void {
    assert.ok(index.localReachable.has(bindingId('entry.ts', 'localValue')));
    assert.ok(index.localReachable.has(bindingId('entry.ts', 'buildValue')));
    assert.strictEqual(index.localReachable.has(bindingId('entry.ts', 'unusedValue')), false);
}
