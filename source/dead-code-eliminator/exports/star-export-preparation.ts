import { SyntaxKind, ScriptTarget, ts, type SourceFile } from 'ts-morph';
import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import type { ExportReference, ModuleExportIndex } from './module-export-index.ts';
import type { ModuleExportModel } from './module-export-model.ts';
import { resolveImportedExport, type ExportTargetResolver, type ImportedExport } from './module-export-resolver.ts';

type StarExport = ModuleExportModel['stars'][number];
type StarSelection = {
    readonly index: ModuleExportIndex;
    readonly source: SourceFile;
    readonly resolveModule: ExportTargetResolver;
};

function isNamedRequest(request: ImportedExport | undefined): request is ExportReference {
    return request?.name !== undefined;
}

function moduleRequests(model: ModuleExportModel, resolveModule: ExportTargetResolver): readonly ExportReference[] {
    const requests = Array
        .from(model.locals.values(), function (binding) {
            return resolveImportedExport(binding.declarationNode, resolveModule);
        })
        .filter(isNamedRequest);
    const forwarded = Array.from(model.entries.values()).flatMap(function (entry): readonly ExportReference[] {
        if (entry.kind !== 'forward') {
            return [];
        }
        const source = resolveModule(model.source, entry.specifier);
        return source === undefined ? [] : [ { source, name: entry.name } ];
    });
    return [ ...requests, ...forwarded ];
}

function invalidRequestTargets(index: ModuleExportIndex, resolveModule: ExportTargetResolver): ReadonlySet<SourceFile> {
    const targets = new Set<SourceFile>();
    for (const model of index.models.values()) {
        for (const request of moduleRequests(model, resolveModule)) {
            const status = index.status(request.source, request.name);
            if (status === 'missing' || status === 'ambiguous') {
                targets.add(request.source);
            }
        }
    }
    return targets;
}

function exportNameSource(name: string): string {
    const scanner = ts.createScanner(ScriptTarget.ESNext, true, undefined, name);
    const token = scanner.scan();
    const identifier = token === SyntaxKind.Identifier ||
        token >= SyntaxKind.FirstKeyword && token <= SyntaxKind.LastKeyword;
    return identifier && scanner.getTokenEnd() === name.length && scanner.getTokenValue() === name
        ? name
        : JSON.stringify(name);
}

function selectedNames(star: StarExport, selection: StarSelection, remaining: ReadonlySet<string>): readonly string[] {
    const target = star.specifier === undefined ? undefined : selection.resolveModule(selection.source, star.specifier);
    return Array.from(remaining).filter(function (name) {
        return target !== undefined &&
            selection.index.sameExport({ source: selection.source, name }, { source: target, name });
    });
}

function moduleEdits(
    selection: StarSelection,
    protectedSources: ReadonlySet<SourceFile>
): readonly SourceTextEdit[] {
    const model = selection.index.models.get(selection.source);
    const names = selection.index.names(selection.source);
    if (model === undefined || names === undefined || protectedSources.has(selection.source)) {
        return [];
    }
    const remaining = new Set(
        Array.from(names).filter(function (name) {
            return name !== 'default' && !model.entries.has(name);
        })
    );
    return model.stars.map(function (star) {
        const selected = selectedNames(star, selection, remaining);
        for (const name of selected) {
            remaining.delete(name);
        }
        const token = star.declaration.getFirstChildByKindOrThrow(SyntaxKind.AsteriskToken);
        return {
            start: token.getStart(),
            end: token.getEnd(),
            content: `{${selected.map(exportNameSource).join(',')}}`
        };
    });
}

export function normalizeStarExports(
    preparations: readonly SourcePreparation[],
    index: ModuleExportIndex,
    resolveModule: ExportTargetResolver
): void {
    const protectedSources = invalidRequestTargets(index, resolveModule);
    const plans = preparations.map(function (preparation) {
        return {
            preparation,
            edits: moduleEdits(
                { index, source: preparation.sourceFile, resolveModule },
                protectedSources
            )
        };
    });
    for (const plan of plans) {
        plan.preparation.applyEdits(plan.edits);
    }
}
