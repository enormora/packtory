import type { Project } from 'ts-morph';
import type { ExternalDependencies } from '../dependency-scanner/external-dependencies.ts';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { PackageSurface } from '../package-surface/surface.ts';

type ExternalPackageArtifactModuleReference = {
    readonly type: 'external-package';
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
    readonly packageName: string;
};

type GeneratedManifestArtifactModuleReference = {
    readonly type: 'generated-manifest';
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
    readonly targetFilePath: string;
};

type LinkedCodeArtifactModuleReference = {
    readonly type: 'linked-code';
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
    readonly packageName: string;
    readonly targetFilePath: string;
};

type LocalAssetArtifactModuleReference = {
    readonly type: 'local-asset';
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
    readonly targetFilePath: string;
};

type LocalCodeArtifactModuleReference = {
    readonly type: 'local-code';
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
    readonly targetFilePath: string;
};

type PackageArtifactModuleReference = ExternalPackageArtifactModuleReference | LinkedCodeArtifactModuleReference;

type LocalFileArtifactModuleReference = LocalAssetArtifactModuleReference | LocalCodeArtifactModuleReference;

type LocalArtifactModuleReference = GeneratedManifestArtifactModuleReference | LocalFileArtifactModuleReference;

export type ArtifactModuleReference = LocalArtifactModuleReference | PackageArtifactModuleReference;

export type BundleResource = {
    readonly fileDescription: TransferableFileDescription;
    readonly directDependencies: ReadonlySet<string>;
    readonly moduleReferences: readonly ArtifactModuleReference[];
    readonly isExplicitlyIncluded: boolean;
    readonly isGeneratedManifest?: true | undefined;
};

export type ResolvedContent = BundleResource & {
    readonly project?: Project | undefined;
};

export type RootFileDescription = {
    readonly js: TransferableFileDescription;
    readonly declarationFile?: TransferableFileDescription | undefined;
};

export type ResolvedBundle = {
    readonly contents: readonly ResolvedContent[];
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly surface: PackageSurface;
    readonly name: string;
    readonly exportPackageJson?: true | undefined;
    readonly externalDependencies: ExternalDependencies;
};

export function rootHasDeclarationFile(
    root: RootFileDescription
): root is RootFileDescription & { readonly declarationFile: TransferableFileDescription; } {
    return root.declarationFile !== undefined;
}
