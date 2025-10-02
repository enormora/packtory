import type { ExternalDependencies } from '../dependency-scanner/external-dependencies.ts';
import type { BundleResource, ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';

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

export type BundleSubstitutionSource = Pick<LinkedBundle, 'contents' | 'name'>;
