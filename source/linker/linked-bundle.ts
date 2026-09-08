import type { ExternalDependencies } from '../dependency-scanner/external-dependencies.ts';
import type { SourceMapTransform } from '../dead-code-eliminator/transform/atom-translator.ts';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
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
    readonly substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
    readonly sourceMapTransformsByTargetPath: ReadonlyMap<string, readonly SourceMapTransform[]>;
    readonly externalDependencies: ExternalDependencies;
};

export type BundleSubstitutionSource = {
    readonly contents: readonly {
        readonly directDependencies: ReadonlySet<string>;
        readonly fileDescription: TransferableFileDescription;
    }[];
    readonly name: string;
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly surface: PackageSurface;
};
type BundleWithContents<TResource extends { readonly isSubstituted: boolean; }> = {
    readonly contents: readonly TResource[];
};

export function getSubstitutedResources<TResource extends { readonly isSubstituted: boolean; }>(
    bundle: BundleWithContents<TResource>
): readonly TResource[] {
    return bundle.contents.filter(function (resource) {
        return resource.isSubstituted;
    });
}
