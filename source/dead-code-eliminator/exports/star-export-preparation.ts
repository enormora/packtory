import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import type { ExportReference, ModuleExportIndex } from './module-export-index.ts';
import type { ModuleExportModel } from './module-export-model.ts';
import {
    resolveImportedExport,
    resolveModuleExport,
    type ExportTargetResolver,
    type ImportedExport
} from './module-export-resolver.ts';

type StarExport = ModuleExportModel['stars'][number];
type StarSelection = {
    readonly index: ModuleExportIndex;
    readonly model: ModuleExportModel;
    readonly resolveModule: ExportTargetResolver;
};

function isNamedRequest(request: ImportedExport | undefined): request is ExportReference {
    return request?.name !== undefined;
}

function* moduleRequests(model: ModuleExportModel, resolveModule: ExportTargetResolver): Iterable<ExportReference> {
    for (const binding of model.locals.values()) {
        const request = resolveImportedExport(binding.declarationNode, resolveModule);
        if (isNamedRequest(request)) {
            yield request;
        }
    }
    const forwarded = Array.from(model.entries.values()).filter(function (entry) {
        return entry.kind === 'forward';
    });
    for (const entry of forwarded) {
        const request = resolveModuleExport(model.source, entry.specifier, entry.name, resolveModule);
        if (isNamedRequest(request)) {
            yield request;
        }
    }
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
    return /^[$_\p{ID_Start}][$\u{200C}\u{200D}\p{ID_Continue}]*$/u.test(name) ? name : JSON.stringify(name);
}

function selectedNames(star: StarExport, selection: StarSelection, remaining: ReadonlySet<string>): readonly string[] {
    const specifier = star.declaration.getFirstChildByKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
    const target = selection.resolveModule(selection.model.source, specifier);
    return Array.from(remaining).filter(function (name) {
        return selection.index.sameExport({ source: selection.model.source, name }, { source: target, name });
    });
}

function moduleEdits(
    selection: StarSelection,
    protectedSources: ReadonlySet<SourceFile>
): readonly SourceTextEdit[] {
    const { model } = selection;
    const names = selection.index.names(selection.model.source);
    if (names === undefined || protectedSources.has(selection.model.source)) {
        return [];
    }
    const remaining = new Set(
        Array.from(names).filter(function (name) {
            return !model.entries.has(name);
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
    const plans = preparations.flatMap(function (preparation) {
        const model = index.models.get(preparation.sourceFile);
        return model === undefined ? [] : [ {
            preparation,
            edits: moduleEdits(
                { index, model, resolveModule },
                protectedSources
            )
        } ];
    });
    for (const plan of plans) {
        plan.preparation.applyEdits(plan.edits);
    }
}
