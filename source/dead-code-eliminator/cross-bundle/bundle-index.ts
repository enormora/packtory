import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import type { FileBindings } from '../reachability/local-seed-gathering.ts';

export type IndexedBundle = {
    readonly bundle: LinkedBundle;
    readonly bindingsByFilePath: ReadonlyMap<string, FileBindings>;
};

export type ResolvedTarget = {
    readonly bundleName: string;
    readonly targetFilePath: string;
    readonly indexedBundle: IndexedBundle;
};

export function indexBundles(
    inputs: readonly { readonly bundle: LinkedBundle; readonly fileBindings: readonly FileBindings[]; }[]
): ReadonlyMap<string, IndexedBundle> {
    const map = new Map<string, IndexedBundle>();
    for (const input of inputs) {
        const bindingsByFilePath = new Map<string, FileBindings>(
            input.fileBindings.map(function (file) {
                return [ file.targetFilePath, file ];
            })
        );
        map.set(input.bundle.name, { bundle: input.bundle, bindingsByFilePath });
    }
    return map;
}
