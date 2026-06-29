import type { PackageJson } from 'type-fest';
import { isDefined, pickBy } from 'remeda';
import type { PackageSurface } from './surface.ts';

export type RootFileDescription = {
    readonly js: {
        readonly sourceFilePath: string;
        readonly targetFilePath: string;
        readonly isExecutable: boolean;
        readonly content: string;
    };
    readonly declarationFile?: { readonly sourceFilePath: string; readonly targetFilePath: string; } | undefined;
};

export type BundleLike = {
    readonly name: string;
    readonly exportPackageJson?: true | undefined;
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly surface: PackageSurface;
    readonly contents: readonly {
        readonly fileDescription: { readonly sourceFilePath: string; readonly targetFilePath: string; };
    }[];
};

export type ExplicitSurface = Extract<PackageSurface, { readonly mode: 'explicit'; }>;
export type ImplicitSurface = Extract<PackageSurface, { readonly mode: 'implicit'; }>;

export type ExportsField = NonNullable<PackageJson['exports']>;
export type ExportEntry = Readonly<Record<string, unknown>>;
export type PackageJsonExportLike = Pick<BundleLike, 'exportPackageJson'>;

export function toImportTarget(targetFilePath: string): string {
    return `./${targetFilePath}`;
}

export function buildExportEntry(root: RootFileDescription): ExportEntry {
    return pickBy(
        {
            import: toImportTarget(root.js.targetFilePath),
            types: root.declarationFile === undefined ? undefined : toImportTarget(root.declarationFile.targetFilePath)
        },
        isDefined
    );
}
