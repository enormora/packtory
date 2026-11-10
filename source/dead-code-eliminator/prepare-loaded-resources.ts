import { isDeclarationCodeFile } from '../common/code-files.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import type { LoadedResource, LoadedCodeResource } from './load-resource.ts';
import { extractTopLevelBindings } from './reachability/binding-extractor.ts';
import { bindingIdentifier } from './reachability/binding-identifier.ts';
import { createExpressionPurityChecker } from './pure-expression.ts';
import { createRuntimeModuleResolver } from './runtime-module-resolution.ts';
import { prepareBundleSources } from './transform/bundle-source-preparation.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';
import { prepareLoadedExports } from './exports/loaded-export-preparation.ts';

function recordRemovedBindings(entry: LoadedCodeResource, bundleName: string, trace: DeadCodeEliminationTrace): void {
    const remaining = new Set(entry.bindings.map(function (binding) {
        return binding.name;
    }));
    for (const location of entry.symbolLocations) {
        if (!remaining.has(location.name)) {
            trace?.collector.record({
                type: 'binding-removed',
                bundleName,
                inputFilePath: entry.resource.fileDescription.inputFilePath,
                bindingIdentifier: bindingIdentifier(entry.resource.fileDescription.targetFilePath, location.name)
            });
        }
    }
}

function isRuntimeCodeResource(entry: LoadedResource): entry is LoadedCodeResource {
    return entry.sourceFile !== undefined && !isDeclarationCodeFile(entry.sourceFile.getFilePath());
}

export function prepareLoadedResources(
    loaded: readonly LoadedResource[],
    input: EliminationInput,
    trace: DeadCodeEliminationTrace
): readonly LoadedResource[] {
    if (!input.transformationsEnabled) {
        return loaded;
    }
    prepareLoadedExports(loaded);
    const origins = loaded.flatMap(function (entry) {
        return entry.sourceFile === undefined ? [] : [ {
            sourceFile: entry.sourceFile,
            targetFilePath: entry.resource.fileDescription.targetFilePath,
            inputFilePath: entry.resource.fileDescription.inputFilePath,
            moduleReferences: entry.resource.moduleReferences
        } ];
    });
    const resolveModule = createRuntimeModuleResolver(origins);
    const isPure = createExpressionPurityChecker(input.deadCodeElimination, resolveModule);
    prepareBundleSources(loaded.filter(isRuntimeCodeResource), origins, resolveModule, isPure);
    return loaded.map(function (entry) {
        if (entry.sourceFile === undefined) {
            return entry;
        }
        const prepared = { ...entry, bindings: extractTopLevelBindings(entry.sourceFile) };
        recordRemovedBindings(prepared, input.bundle.name, trace);
        return prepared;
    });
}
