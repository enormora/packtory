import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { resolvePublicModuleSourceFilePath } from '../../package-surface/public-specifiers.ts';
import type { FileBindings } from '../reachability/local-seed-gathering.ts';

export type IndexedBundle = {
    readonly bundle: LinkedBundle;
    readonly bindingsByFilePath: ReadonlyMap<string, FileBindings>;
};

export type ResolvedTarget = {
    readonly bundleName: string;
    readonly sourceFilePath: string;
    readonly indexedBundle: IndexedBundle;
};

export function indexBundles(
    inputs: readonly { readonly bundle: LinkedBundle; readonly fileBindings: readonly FileBindings[]; }[]
): ReadonlyMap<string, IndexedBundle> {
    const map = new Map<string, IndexedBundle>();
    for (const input of inputs) {
        const bindingsByFilePath = new Map<string, FileBindings>(
            input.fileBindings.map(function (file) {
                return [ file.sourceFilePath, file ];
            })
        );
        map.set(input.bundle.name, { bundle: input.bundle, bindingsByFilePath });
    }
    return map;
}

function tryResolveAgainstBundle(indexedBundle: IndexedBundle, specifier: string): ResolvedTarget | undefined {
    const sourceFilePath = resolvePublicModuleSourceFilePath(indexedBundle.bundle, specifier);
    if (sourceFilePath === undefined) {
        return undefined;
    }
    return { bundleName: indexedBundle.bundle.name, sourceFilePath, indexedBundle };
}

export function resolveCrossBundleTarget(
    specifier: string,
    indexed: ReadonlyMap<string, IndexedBundle>
): ResolvedTarget | undefined {
    for (const info of indexed.values()) {
        const resolved = tryResolveAgainstBundle(info, specifier);
        if (resolved !== undefined) {
            return resolved;
        }
    }
    return undefined;
}
