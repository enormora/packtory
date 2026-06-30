import { bindingId } from '../reachability/binding-id.ts';
import type { ResolvedTarget } from './bundle-index.ts';

export type SeedMap = ReadonlyMap<string, ReadonlySet<string>>;

export function createSeedStore(): SeedMap {
    return new Map<string, ReadonlySet<string>>();
}

export function recordSeed(seeds: SeedMap, bundleName: string, seed: string): SeedMap {
    const nextSeeds = new Map(seeds);
    const existing = new Set(nextSeeds.get(bundleName));
    existing.add(seed);
    nextSeeds.set(bundleName, existing);
    return nextSeeds;
}

export function seedAllBindings(seeds: SeedMap, target: ResolvedTarget): SeedMap {
    const fileBindings = target.indexedBundle.bindingsByFilePath.get(target.sourceFilePath);
    if (fileBindings === undefined) {
        return seeds;
    }
    let nextSeeds = seeds;
    for (const binding of fileBindings.bindings) {
        nextSeeds = recordSeed(nextSeeds, target.bundleName, bindingId(target.sourceFilePath, binding.name));
    }
    return nextSeeds;
}
