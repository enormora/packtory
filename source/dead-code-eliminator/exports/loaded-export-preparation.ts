import type { LoadedResource } from '../load-resource.ts';
import { createPreparedModuleGraph } from './prepared-module-graph.ts';
import { normalizeStarExports } from './star-export-preparation.ts';

export function prepareLoadedExports(loaded: readonly LoadedResource[]): void {
    const files = loaded.filter(function (entry) {
        return entry.sourceFile !== undefined;
    });
    const graph = createPreparedModuleGraph(files.map(function (entry) {
        return {
            sourceFile: entry.sourceFile,
            targetFilePath: entry.resource.fileDescription.targetFilePath,
            moduleReferences: entry.resource.moduleReferences
        };
    }));
    normalizeStarExports(files, graph.index, graph.resolveModule);
}
