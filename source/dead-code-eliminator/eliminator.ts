import { zip } from 'remeda';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { AnalyzedBundle, DeadCodeEliminator, SymbolEliminationInspector } from './analyzed-bundle.ts';
import { analyzeBundleWithSeeds, crossBundleInputFrom } from './bundle-analysis.ts';
import { buildCrossBundleSeeds } from './cross-bundle/cross-bundle-seeds.ts';
import { maybeEmitElimination } from './elimination-emitter.ts';
import { loadBundle, type CreateProject, type LoadedBundle } from './load-bundle.ts';
import {
    createSymbolRetentionCollector,
    inspectBundleSymbols,
    locateSymbols
} from './symbol-inspection.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';

export type DeadCodeEliminatorDependencies = {
    readonly createProject: CreateProject;
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly trace: DeadCodeEliminationTrace;
};

export type InspectableDeadCodeEliminator = DeadCodeEliminator & {
    readonly inspectSymbols: SymbolEliminationInspector;
};

export function createDeadCodeEliminator(dependencies: DeadCodeEliminatorDependencies): InspectableDeadCodeEliminator {
    const { createProject, progressBroadcaster } = dependencies;
    function analyze(
        loadedBundles: readonly LoadedBundle[],
        trace: DeadCodeEliminationTrace
    ): readonly AnalyzedBundle[] {
        const seedMap = buildCrossBundleSeeds(loadedBundles.map(crossBundleInputFrom), trace);
        const analyzed = loadedBundles.map(function (loaded) {
            return analyzeBundleWithSeeds(loaded, seedMap.get(loaded.input.bundle.name), trace);
        });
        maybeEmitElimination(
            progressBroadcaster,
            loadedBundles.map(function (loaded) {
                return loaded.input.bundle;
            }),
            analyzed
        );
        return analyzed;
    }
    return {
        async eliminate(inputs) {
            const loaded = inputs.map(function (input) {
                return loadBundle(createProject, input, dependencies.trace);
            });
            return analyze(loaded, dependencies.trace);
        },
        async inspectSymbols(inputs) {
            const retention = createSymbolRetentionCollector();
            const trace = {
                collector: {
                    record(event: Parameters<NonNullable<DeadCodeEliminationTrace>['collector']['record']>[0]) {
                        retention.record(event);
                        dependencies.trace?.collector.record(event);
                    }
                }
            };
            const loaded = inputs.map(function (input) {
                return loadBundle(createProject, input, trace);
            });
            const snapshots = loaded.map(function (bundle) {
                return { loaded: bundle, locations: locateSymbols(bundle) };
            });
            const analyzed = analyze(loaded, trace);
            return zip(snapshots, analyzed).map(function ([ snapshot, bundle ]) {
                return inspectBundleSymbols(
                    snapshot.loaded.input.transformationsEnabled,
                    snapshot.locations,
                    bundle,
                    retention.pathsForPackage(bundle.name)
                );
            });
        }
    };
}
