import type { PackageJson } from 'type-fest';
import type { EntryPoint } from '../config/entry-point.js';
import type { AdditionalFileDescription } from '../config/additional-files.js';
import type { BundleDescription } from './bundle-description.js';

export type EntryPoints = readonly [EntryPoint, ...(readonly EntryPoint[])];

type NonCustomizableAttribute = 'dependencies' | 'devDependencies' | 'main' | 'name' | 'types' | 'version';
type AdditionalPackageJsonAttributes = Readonly<Exclude<PackageJson, NonCustomizableAttribute>>;

export type BundleBuildOptions = {
    readonly sourcesFolder: string;
    readonly entryPoints: EntryPoints;
    readonly name: string;
    readonly version: string;
    readonly mainPackageJson: PackageJson;
    readonly includeSourceMapFiles?: boolean;
    readonly bundleDependencies?: BundleDescription[];
    readonly bundlePeerDependencies?: BundleDescription[];
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
