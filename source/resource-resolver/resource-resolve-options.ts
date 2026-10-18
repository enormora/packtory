import type { AdditionalFileDescription } from '../configuration/additional-files.ts';
import type { MainPackageManifest } from '../configuration/package-manifest.ts';
import type { Root } from '../configuration/root.ts';
import { implicitPackageSurface, type PackageSurface } from '../package-surface/surface.ts';

type Roots = Readonly<Record<string, Root>>;

export type ResourceResolveOptions = {
    readonly sourcesFolder: string;
    readonly name: string;
    readonly exportPackageManifest?: true | undefined;
    readonly includeSourceMapFiles: boolean;
    readonly additionalFiles: readonly (AdditionalFileDescription | string)[];
    readonly mainPackageManifest: MainPackageManifest;
    readonly roots: Roots;
    readonly surface?: PackageSurface | undefined;
};

export type ResolvedRootsAndSurface = {
    readonly roots: Roots;
    readonly surface: PackageSurface;
};

export function resolveRootsAndSurface(options: ResourceResolveOptions): ResolvedRootsAndSurface {
    const rootEntries = Object.entries(options.roots);
    const [ firstRootEntry ] = rootEntries;
    if (firstRootEntry === undefined) {
        throw new Error(`Package "${options.name}" must define at least one root`);
    }

    const [ firstRootIdentifier ] = firstRootEntry;
    return {
        roots: options.roots,
        surface: options.surface ?? implicitPackageSurface(firstRootIdentifier)
    };
}
