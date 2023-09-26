import {PackageJson} from "type-fest";
import {BundleDescription} from "./bundle-description.js"

export interface EntryPoint {
    readonly js: string;
    readonly declarationFile?: string;
}

export type EntryPoints = readonly [ EntryPoint, ... (readonly EntryPoint[]) ];

export interface AdditionalFileDescription {
    sourceFilePath: string;
    targetFilePath: string;
}

export interface BundleBuildOptions {
    readonly sourcesFolder: string;
    readonly entryPoints: EntryPoints;
    readonly name: string;
    readonly version: string;
    readonly mainPackageJson: PackageJson;
    readonly includeSourceMapFiles?: boolean;
    readonly dependencies?: BundleDescription[];
    readonly peerDependencies?: BundleDescription[];
    readonly additionalFiles?: readonly (string | AdditionalFileDescription)[];
    readonly additionalPackageJsonAttributes?: Exclude<PackageJson, 'name' | 'version' | 'dependencies' | 'devDependencies' | 'main' | 'types'>
}

function extractName(bundle: BundleDescription): string {
    return bundle.packageJson.name;
}

function findDuplicates(list: string[]): string[] {
    const uniqueValues: string[] = [];

    return list.filter((value) => {
        if (uniqueValues.includes(value)) {
            return true;
        }

        uniqueValues.push(value);

        return false;
    });
}

export function validateBundleBuildOptions(options: BundleBuildOptions): void {
    const {dependencies = [], peerDependencies = []} = options;
    const dependencyNames = dependencies.map(extractName);
    const peerDependencyNames = peerDependencies.map(extractName);
    const allNames = [ ...dependencyNames, ...peerDependencyNames ];
    const duplicatedNames = findDuplicates(allNames);

    if (duplicatedNames.length > 0) {
        throw new Error(`The following packages are listed more than once in dependencies or peerDependencies: ${duplicatedNames.join(', ')}`);
    }
}
