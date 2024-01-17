import type { EntryPoint } from '../config/entry-point.js';
import type { AdditionalFileDescription } from '../config/additional-files.js';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from '../config/package-json.js';
import type { BundleDescription } from './bundle-description.js';

export type EntryPoints = readonly [EntryPoint, ...(readonly EntryPoint[])];

export type BundleBuildOptions = {
    readonly sourcesFolder: string;
    readonly entryPoints: EntryPoints;
    readonly name: string;
    readonly version: string;
    readonly mainPackageJson: MainPackageJson;
    readonly includeSourceMapFiles?: boolean;
    readonly bundleDependencies?: readonly BundleDescription[];
    readonly bundlePeerDependencies?: readonly BundleDescription[];
    readonly additionalFiles?: readonly (AdditionalFileDescription | string)[];
    readonly additionalPackageJsonAttributes?: AdditionalPackageJsonAttributes;
};

function extractName(bundle: BundleDescription): string {
    return bundle.packageJson.name;
}

function findDuplicates(list: readonly string[]): readonly string[] {
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
    const { bundleDependencies = [], bundlePeerDependencies = [] } = options;
    const dependencyNames = bundleDependencies.map(extractName);
    const peerDependencyNames = bundlePeerDependencies.map(extractName);
    const allNames = [...dependencyNames, ...peerDependencyNames];
    const duplicatedNames = findDuplicates(allNames);

    if (duplicatedNames.length > 0) {
        const formattedNames = duplicatedNames.join(', ');
        throw new Error(
            `The following packages are listed more than once in dependencies or peerDependencies: ${formattedNames}`
        );
    }
}
