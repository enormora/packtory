import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { DeadCodeEliminator } from './analyzed-bundle.ts';
import { analyzeBundleWithSeeds, crossBundleInputFrom } from './bundle-analysis.ts';
import { buildCrossBundleSeeds } from './cross-bundle/cross-bundle-seeds.ts';
import { maybeEmitElimination } from './elimination-emitter.ts';
import { loadBundle, type CreateProject } from './load-bundle.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';

export type DeadCodeEliminatorDependencies = {
    readonly createProject: CreateProject;
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly trace: DeadCodeEliminationTrace;
};

export function createDeadCodeEliminator(dependencies: DeadCodeEliminatorDependencies): DeadCodeEliminator {
    const { createProject, progressBroadcaster, trace } = dependencies;
    return {
        async eliminate(inputs) {
            const loadedBundles = inputs.map(function (input) {
                return loadBundle(createProject, input, trace);
            });
            const seedMap = buildCrossBundleSeeds(loadedBundles.map(crossBundleInputFrom), trace);
            const analyzed = loadedBundles.map(function (loaded) {
                return analyzeBundleWithSeeds(loaded, seedMap.get(loaded.input.bundle.name), trace);
            });
            maybeEmitElimination(
                progressBroadcaster,
                inputs.map(function (input) {
                    return input.bundle;
                }),
                analyzed
            );
            return analyzed;
        }
    };
}
