import type { ExternalDependencies } from '../dependency-scanner/external-dependencies.ts';
import type { PackageSurface } from '../package-surface/surface.ts';
import type { BundleResource, RootFileDescription } from '../resource-resolver/resolved-bundle.ts';

export type LinkedBundleResource = BundleResource & {
    readonly isSubstituted: boolean;
};

export type LinkedBundle = {
    readonly name: string;
    readonly contents: readonly LinkedBundleResource[];
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly surface: PackageSurface;
    readonly exportPackageJson?: true | undefined;
    readonly linkedBundleDependencies: ExternalDependencies;
    readonly externalDependencies: ExternalDependencies;
};

export type BundleSubstitutionSource = Pick<LinkedBundle, 'contents' | 'name' | 'roots' | 'surface'>;
