import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import type { FileBindings } from '../reachability/local-seed-gathering.ts';
import type { DeadCodeEliminationTrace } from '../trace.ts';
import { indexBundles } from './bundle-index.ts';
import { walkCrossBundleStatements } from './import-export-walker.ts';
import { createSeedStore, type SeedMap } from './seed-store.ts';

export type CrossBundleInput = {
    readonly bundle: LinkedBundle;
    readonly fileBindings: readonly FileBindings[];
    readonly localReachable: ReadonlySet<string>;
};

export function buildCrossBundleSeeds(inputs: readonly CrossBundleInput[], trace: DeadCodeEliminationTrace): SeedMap {
    const indexed = indexBundles(inputs);
    let seeds = createSeedStore();
    for (const input of inputs) {
        for (const file of input.fileBindings) {
            seeds = walkCrossBundleStatements(file.sourceFile, {
                indexed,
                seeds,
                sourceBundleName: input.bundle.name,
                inputFilePath: file.inputFilePath,
                sourceTargetFilePath: file.targetFilePath,
                moduleReferences: file.moduleReferences,
                localReachable: input.localReachable,
                trace
            });
        }
    }
    return seeds;
}
