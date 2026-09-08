import assert from 'node:assert';
import path from 'node:path';
import { getModuleReferenceLiterals } from '../dependency-scanner/source-file-references.ts';
import { extractTopLevelBindings } from '../dead-code-eliminator/reachability/binding-extractor.ts';
import { bindingId } from '../dead-code-eliminator/reachability/binding-id.ts';
import type { FileBindings } from '../dead-code-eliminator/reachability/local-seed-gathering.ts';
import { buildReachabilityIndex, type ReachabilityIndex } from '../dead-code-eliminator/reachability/reachability.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import { createProject } from './typescript-project.ts';

export const probeTestTimeoutMs = 10_000;

function localModuleReferences(filePath: string, content: string): readonly ArtifactModuleReference[] {
    const project = createProject({ withFiles: [ { filePath, content } ] });
    const sourceFile = project.getSourceFileOrThrow(filePath);
    return getModuleReferenceLiterals(sourceFile).flatMap(function (literal) {
        const specifier = literal.getLiteralValue();
        if (!specifier.startsWith('.')) {
            return [];
        }
        return {
            type: 'local-code',
            sourceSpecifier: specifier,
            emittedSpecifier: specifier,
            targetFilePath: path.posix.normalize(path.posix.join(path.posix.dirname(filePath), specifier))
        };
    });
}

export function fileBindingsFor(filePath: string, content: string): FileBindings {
    const project = createProject({ withFiles: [ { filePath, content } ] });
    const sourceFile = project.getSourceFileOrThrow(filePath);
    return {
        inputFilePath: filePath,
        parsedInputFilePath: sourceFile.getFilePath(),
        targetFilePath: filePath,
        moduleReferences: localModuleReferences(filePath, content),
        sourceFile,
        bindings: extractTopLevelBindings(sourceFile)
    };
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
        return {
            inputFilePath: file.filePath,
            parsedInputFilePath: sourceFile.getFilePath(),
            targetFilePath: file.filePath,
            moduleReferences: localModuleReferences(file.filePath, file.content),
            sourceFile,
            bindings: extractTopLevelBindings(sourceFile)
        };
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
    return buildReachabilityIndex({
        bundleName: 'pkg',
        files,
        entryPointFilePaths: new Set([ 'entry.ts' ]),
        deadCodeElimination: undefined,
        trace: undefined
    });
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
    return buildReachabilityIndex({
        bundleName: 'pkg',
        files,
        entryPointFilePaths: new Set([ 'entry.ts' ]),
        deadCodeElimination: undefined,
        trace: undefined
    });
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
