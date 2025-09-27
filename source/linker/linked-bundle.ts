import type { ExternalDependencies } from '../dependency-scanner/external-dependencies.js';
import type { BundleResource, ResolvedBundle } from '../resource-resolver/resolved-bundle.js';

export type LinkedBundleResource = BundleResource & {
    readonly isSubstituted: boolean;
};

export type LinkedBundle = {
    readonly name: string;
    readonly contents: readonly LinkedBundleResource[];
    readonly entryPoints: ResolvedBundle['entryPoints'];
    readonly linkedBundleDependencies: ExternalDependencies;
    readonly externalDependencies: ExternalDependencies;
};
