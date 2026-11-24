import type { EliminationInput } from './analyzed-bundle.ts';
import type { LoadedResource, LoadedCodeResource } from './load-resource.ts';
import { extractTopLevelBindings } from './reachability/binding-extractor.ts';
import { bindingIdentifier } from './reachability/binding-identifier.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';
import { prepareLoadedExports } from './exports/loaded-export-preparation.ts';
import { prepareRuntimeResources } from './prepare-runtime-resources.ts';

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

export function prepareLoadedResources(
    loaded: readonly LoadedResource[],
    input: EliminationInput,
    trace: DeadCodeEliminationTrace
): readonly LoadedResource[] {
    if (!input.transformationsEnabled) {
        return loaded;
    }
    prepareLoadedExports(loaded);
    return prepareRuntimeResources(loaded).map(function (entry) {
        if (entry.sourceFile === undefined) {
            return entry;
        }
        const prepared = { ...entry, bindings: extractTopLevelBindings(entry.sourceFile) };
        recordRemovedBindings(prepared, input.bundle.name, trace);
        return prepared;
    });
}
