export function packageNameMap<T extends { readonly name: string }>(packages: readonly T[]): ReadonlyMap<string, T> {
    const packagesByName = new Map<string, T>();

    for (const packageEntry of packages) {
        packagesByName.set(packageEntry.name, packageEntry);
    }

    return packagesByName;
}
