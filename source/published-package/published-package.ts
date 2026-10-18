import { isString } from 'remeda';
import type { PackageJson as PackageManifest, SetRequired } from 'type-fest';
import type { AdditionalPackageManifestAttributes, MainPackageManifest } from '../configuration/package-manifest.ts';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import type { PackageSurface } from '../package-surface/surface.ts';
import type { RootFileDescription } from '../resource-resolver/resolved-bundle.ts';

export type PublishedPackageManifest = Readonly<SetRequired<PackageManifest, 'name' | 'version'>>;
type PublishedImportsField = NonNullable<MainPackageManifest['imports']>;
type PublishedPackageExportsField = NonNullable<PackageManifest['exports']>;
type PublishedSideEffectsField = readonly string[] | false | undefined;
type PublishedPackageContent = {
    readonly directDependencies: ReadonlySet<string>;
    readonly fileDescription: TransferableFileDescription;
    readonly isExplicitlyIncluded: boolean;
    readonly isSubstituted: boolean;
    readonly isGeneratedManifest?: true | undefined;
};

export type PublishedPackage = {
    readonly contents: readonly PublishedPackageContent[];
    readonly name: string;
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly sideEffectsField: PublishedSideEffectsField;
    readonly surface: PackageSurface;
    readonly version: string;
    readonly dependencies: Readonly<Record<string, string>>;
    readonly peerDependencies: Readonly<Record<string, string>>;
    readonly importsField?: PublishedImportsField | undefined;
    readonly exportsField: PublishedPackageExportsField;
    readonly executableField?: PackageManifest['bin'] | undefined;
    readonly additionalAttributes: AdditionalPackageManifestAttributes;
    readonly mainFile: FileDescription | TransferableFileDescription;
    readonly typesMainFile?: FileDescription | TransferableFileDescription | undefined;
    readonly packageType: 'module';
};

export type PublishedPackageWithManifest = PublishedPackage & {
    readonly manifestFile: FileDescription;
    readonly packageManifest: PublishedPackageManifest;
};

export type ArtifactSourcePackage = Pick<
    PublishedPackageWithManifest,
    'contents' | 'executableField' | 'manifestFile' | 'name'
>;

export type SoftwareBillOfMaterialsPackage = Pick<
    PublishedPackageWithManifest,
    'dependencies' | 'packageManifest' | 'peerDependencies'
>;
export type SoftwareBillOfMaterialsSiblingPackage = Pick<PublishedPackageWithManifest, 'name' | 'packageManifest'>;
export type ArtifactPublishPackage = Pick<
    PublishedPackageWithManifest,
    'contents' | 'executableField' | 'manifestFile' | 'name' | 'packageManifest'
>;

export function explicitExecutableTargetPaths(
    sourcePackage: Pick<ArtifactSourcePackage, 'executableField'>
): ReadonlySet<string> {
    if (sourcePackage.executableField === undefined) {
        return new Set<string>();
    }

    const targets = isString(sourcePackage.executableField)
        ? [ sourcePackage.executableField ]
        : Object.values(sourcePackage.executableField).filter(isString);
    return new Set(
        targets.map(function (target) {
            return target.replace(/^\.\//u, '');
        })
    );
}
