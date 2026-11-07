import type { PackageJson as PackageManifest } from 'type-fest';
import { isDefined, pickBy } from 'remeda';
import type { PackageRoot } from '../common/package-root.ts';
import type { PackageSurface } from './surface.ts';

export type RootFileDescription = PackageRoot<{
    readonly inputFilePath: string;
    readonly targetFilePath: string;
    readonly isExecutable: boolean;
    readonly content: string;
}, { readonly inputFilePath: string; readonly targetFilePath: string; }>;

export type BundleLike = {
    readonly name: string;
    readonly exportPackageManifest?: true | undefined;
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly surface: PackageSurface;
    readonly contents: readonly {
        readonly fileDescription: { readonly inputFilePath: string; readonly targetFilePath: string; };
    }[];
};

export type ExplicitSurface = Extract<PackageSurface, { readonly mode: 'explicit'; }>;
export type ImplicitSurface = Extract<PackageSurface, { readonly mode: 'implicit'; }>;

export type ExportsField = NonNullable<PackageManifest['exports']>;
export type ExportEntry = Readonly<Record<string, unknown>> | string;
export type PackageManifestExportLike = Pick<BundleLike, 'exportPackageManifest'>;

export function toImportTarget(targetFilePath: string): string {
    return `./${targetFilePath}`;
}

export function buildExportEntry(root: RootFileDescription): ExportEntry {
    if (root.json !== undefined) {
        return toImportTarget(root.json.targetFilePath);
    }
    return pickBy(
        {
            import: root.javaScript === undefined ? undefined : toImportTarget(root.javaScript.targetFilePath),
            types: root.declarationFile === undefined ? undefined : toImportTarget(root.declarationFile.targetFilePath)
        },
        isDefined
    );
}
