import {PackageJson} from "type-fest";

export interface EntryPoint {
    readonly js: string;
    readonly declarationFile?: string;
}

export type EntryPoints = readonly [ EntryPoint, ... (readonly EntryPoint[]) ];

export interface PackageDescription {
    readonly sourcesFolder: string;
    readonly entryPoints: EntryPoints;
    readonly name: string;
    readonly version: string;
    readonly mainPackageJson: PackageJson;
    readonly includeSourceMapFiles?: boolean;
    readonly additionalFiles?: readonly string[];
    readonly additionalPackageJsonAttributes?: Exclude<PackageJson, 'name' | 'version' | 'dependencies' | 'devDependencies' | 'main' | 'types'>
}
