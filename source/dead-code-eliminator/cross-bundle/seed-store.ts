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
