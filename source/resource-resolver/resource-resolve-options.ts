import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import type { Root } from '../config/root.ts';
import { implicitPackageSurface, type PackageSurface } from '../package-surface/surface.ts';

type Roots = Readonly<Record<string, Root>>;
type EntryPoints = readonly [Root, ...(readonly Root[])];

type ResourceResolveOptionsBase = {
    readonly sourcesFolder: string;
    readonly name: string;
    readonly includeSourceMapFiles: boolean;
    readonly additionalFiles: readonly (AdditionalFileDescription | string)[];
    readonly mainPackageJson: MainPackageJson;
};

type ModernResourceResolveOptions = ResourceResolveOptionsBase & {
    readonly roots: Roots;
    readonly surface?: PackageSurface | undefined;
    readonly entryPoints?: EntryPoints | undefined;
};

type LegacyResourceResolveOptions = ResourceResolveOptionsBase & {
    readonly entryPoints: EntryPoints;
    readonly roots?: undefined;
    readonly surface?: undefined;
};

export type ResourceResolveOptions = LegacyResourceResolveOptions | ModernResourceResolveOptions;

function rootsFromEntryPoints(entryPoints: EntryPoints): Roots {
    return Object.fromEntries(
        entryPoints.map((entryPoint, index) => {
            return [index === 0 ? 'main' : `entry${index + 1}`, entryPoint];
        })
    );
}

export function resolveRootsAndSurface(options: ResourceResolveOptions): {
    readonly roots: Roots;
    readonly surface: PackageSurface;
    readonly entryPoints: EntryPoints;
} {
    if ('roots' in options && options.roots !== undefined) {
        const rootEntries = Object.entries(options.roots);
        const [firstRootEntry, ...remainingRootEntries] = rootEntries;
        if (firstRootEntry === undefined) {
            throw new Error(`Package "${options.name}" must define at least one root`);
        }

        const [firstRootId, firstRoot] = firstRootEntry;
        const entryPoints =
            options.entryPoints ??
            ([
                firstRoot,
                ...remainingRootEntries.map(([, root]) => {
                    return root;
                })
            ] as EntryPoints);

        return {
            roots: options.roots,
            surface: options.surface ?? implicitPackageSurface(firstRootId),
            entryPoints
        };
    }

    const roots = rootsFromEntryPoints(options.entryPoints);
    return {
        roots,
        surface: implicitPackageSurface('main'),
        entryPoints: options.entryPoints
    };
}
