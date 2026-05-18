import { bindingId } from '../reachability/binding-id.ts';
import type { ResolvedTarget } from './bundle-index.ts';

export type SeedMap = ReadonlyMap<string, ReadonlySet<string>>;
export type MutableSeedMap = Map<string, Set<string>>;

export function createSeedStore(): MutableSeedMap {
    return new Map<string, Set<string>>();
}

export function recordSeed(seeds: MutableSeedMap, bundleName: string, seed: string): void {
    const existing = seeds.get(bundleName) ?? new Set<string>();
    existing.add(seed);
    seeds.set(bundleName, existing);
}

export function seedAllBindings(seeds: MutableSeedMap, target: ResolvedTarget): void {
    const fileBindings = target.indexedBundle.bindingsByFilePath.get(target.sourceFilePath);
    if (fileBindings === undefined) {
        return;
    }
    for (const binding of fileBindings.bindings) {
        recordSeed(seeds, target.bundleName, bindingId(target.sourceFilePath, binding.name));
    }
}
