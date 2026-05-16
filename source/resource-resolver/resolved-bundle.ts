import type { Project } from 'ts-morph';
import type { ExternalDependencies } from '../dependency-scanner/external-dependencies.ts';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { PackageSurface } from '../package-surface/surface.ts';

export type BundleResource = {
    readonly fileDescription: TransferableFileDescription;
    readonly directDependencies: ReadonlySet<string>;
    readonly isExplicitlyIncluded: boolean;
};

export type ResolvedContent = BundleResource & {
    readonly project?: Project | undefined;
};

export type RootFileDescription = {
    js: TransferableFileDescription;
    declarationFile?: TransferableFileDescription | undefined;
};

export type ResolvedBundle = {
    readonly contents: readonly ResolvedContent[];
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly surface: PackageSurface;
    readonly name: string;
    readonly externalDependencies: ExternalDependencies;
};
