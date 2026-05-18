import { isString } from 'remeda';
import type { PackageJson, SetRequired } from 'type-fest';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from '../config/package-json.ts';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import type { PackageSurface } from '../package-surface/surface.ts';
import type { RootFileDescription } from '../resource-resolver/resolved-bundle.ts';

export type PublishedPackageJson = Readonly<SetRequired<PackageJson, 'name' | 'version'>>;
type PublishedImportsField = NonNullable<MainPackageJson['imports']>;
type PublishedPackageExportsField = NonNullable<PackageJson['exports']>;
type PublishedSideEffectsField = readonly string[] | false | undefined;
type PublishedPackageContent = {
    readonly directDependencies: ReadonlySet<string>;
    readonly fileDescription: TransferableFileDescription;
    readonly isExplicitlyIncluded: boolean;
    readonly isSubstituted: boolean;
};

export type PublishedPackage = {
    readonly contents: readonly PublishedPackageContent[];
    readonly name: string;
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly sideEffectsField: PublishedSideEffectsField;
    readonly surface: PackageSurface;
    readonly version: string;
    readonly dependencies: Record<string, string>;
    readonly peerDependencies: Record<string, string>;
    readonly importsField?: PublishedImportsField | undefined;
    readonly exportsField: PublishedPackageExportsField;
    readonly binField?: PackageJson['bin'] | undefined;
    readonly additionalAttributes: AdditionalPackageJsonAttributes;
    readonly mainFile: FileDescription | TransferableFileDescription;
    readonly typesMainFile?: FileDescription | TransferableFileDescription | undefined;
    readonly packageType: 'module';
};

export type PublishedPackageWithManifest = PublishedPackage & {
    readonly manifestFile: FileDescription;
    readonly packageJson: PublishedPackageJson;
};

export type ArtifactSourcePackage = Pick<
    PublishedPackageWithManifest,
    'binField' | 'contents' | 'manifestFile' | 'name'
>;

export type SbomPackage = Pick<PublishedPackageWithManifest, 'dependencies' | 'packageJson' | 'peerDependencies'>;
export type SbomSiblingPackage = Pick<PublishedPackageWithManifest, 'name' | 'packageJson'>;
export type ArtifactPublishPackage = Pick<
    PublishedPackageWithManifest,
    'binField' | 'contents' | 'manifestFile' | 'name' | 'packageJson'
>;

export function explicitBinTargetPaths(pkg: Pick<ArtifactSourcePackage, 'binField'>): ReadonlySet<string> {
    if (pkg.binField === undefined) {
        return new Set<string>();
    }

    const targets = isString(pkg.binField) ? [pkg.binField] : Object.values(pkg.binField).filter(isString);
    return new Set(
        targets.map((target) => {
            return target.replace(/^\.\//u, '');
        })
    );
}
