import type { LinkedBundle } from '../linker/linked-bundle.ts';

export type CheckContext = {
    readonly bundles: readonly LinkedBundle[];
};
