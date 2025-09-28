import type { Project } from 'ts-morph';
import type { ExternalDependencies } from '../dependency-scanner/external-dependencies.ts';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';

export type BundleResource = {
    readonly fileDescription: TransferableFileDescription;
    readonly directDependencies: ReadonlySet<string>;
};

export type ResolvedContent = BundleResource & {
    readonly project?: Project | undefined;
};

export type EntryPointFileDescription = {
    js: TransferableFileDescription;
    declarationFile?: TransferableFileDescription | undefined;
};

export type ResolvedBundle = {
    readonly contents: readonly ResolvedContent[];
    readonly entryPoints: readonly [EntryPointFileDescription, ...EntryPointFileDescription[]];
    readonly name: string;
    readonly externalDependencies: ExternalDependencies;
};
