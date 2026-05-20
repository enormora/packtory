import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import type { Root } from '../config/root.ts';
import { implicitPackageSurface, type PackageSurface } from '../package-surface/surface.ts';

type Roots = Readonly<Record<string, Root>>;

export type ResourceResolveOptions = {
    readonly sourcesFolder: string;
    readonly name: string;
    readonly exportPackageJson?: true | undefined;
    readonly includeSourceMapFiles: boolean;
    readonly additionalFiles: readonly (AdditionalFileDescription | string)[];
    readonly mainPackageJson: MainPackageJson;
    readonly roots: Roots;
    readonly surface?: PackageSurface | undefined;
};

export type ResolvedRootsAndSurface = {
    readonly roots: Roots;
    readonly surface: PackageSurface;
};

export function resolveRootsAndSurface(options: ResourceResolveOptions): ResolvedRootsAndSurface {
    const rootEntries = Object.entries(options.roots);
    const [firstRootEntry] = rootEntries;
    if (firstRootEntry === undefined) {
        throw new Error(`Package "${options.name}" must define at least one root`);
    }

    const [firstRootId] = firstRootEntry;
    return {
        roots: options.roots,
        surface: options.surface ?? implicitPackageSurface(firstRootId)
    };
}
