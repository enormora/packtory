import type { SourceFile } from 'ts-morph';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import type { FileBindings } from '../reachability/local-seed-gathering.ts';
import { indexBundles } from './bundle-index.ts';
import { walkCrossBundleStatements } from './import-export-walker.ts';
import { createSeedStore, type SeedMap } from './seed-store.ts';

export type CrossBundleInput = {
    readonly bundle: LinkedBundle;
    readonly sourceFiles: readonly Readonly<SourceFile>[];
    readonly fileBindings: readonly FileBindings[];
    readonly localReachable: ReadonlySet<string>;
};

export function buildCrossBundleSeeds(inputs: readonly CrossBundleInput[]): SeedMap {
    const indexed = indexBundles(inputs);
    let seeds = createSeedStore();
    for (const input of inputs) {
        for (const sourceFile of input.sourceFiles) {
            seeds = walkCrossBundleStatements(sourceFile, {
                indexed,
                seeds,
                sourceFilePath: sourceFile.getFilePath(),
                localReachable: input.localReachable
            });
        }
    }
    return seeds;
}
