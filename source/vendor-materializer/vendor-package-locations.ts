import path from 'node:path';
import {
    ancestorInstalledDependencyPathCandidates,
    installedDependenciesFolderName
} from '../common/package-layout.ts';

type PackageLocationRequest = {
    readonly name: string;
    readonly realPath: string;
    readonly fromFolder: string;
    readonly targetFolder: string;
};

type PackageLocation = {
    readonly directory: string;
    readonly alreadyCollected: boolean;
};

export type VendorPackageLocations = {
    readonly locate: (request: PackageLocationRequest) => PackageLocation;
};

function relativeDirectoryInside(parent: string, directory: string): string | undefined {
    const relative = path.relative(parent, directory);
    return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
        ? undefined
        : relative.split(path.sep).join('/');
}

function isNamedInstalledPackage(directory: string, name: string): boolean {
    return directory.startsWith(`${installedDependenciesFolderName}/`) &&
        directory.endsWith(`/${name}`) &&
        !directory.startsWith(`${installedDependenciesFolderName}/.pnpm/`);
}

function parentPackageDirectory(
    request: PackageLocationRequest,
    locations: ReadonlyMap<string, string>
): string | undefined {
    const parents = Array.from(locations).toSorted(function (left, right) {
        return right[1].length - left[1].length;
    });
    for (const [ targetDirectory, sourceDirectory ] of parents) {
        const relative = relativeDirectoryInside(sourceDirectory, request.realPath);
        if (relative !== undefined) {
            return path.posix.join(targetDirectory, relative);
        }
    }
    return undefined;
}

function installedDirectory(
    projectFolder: string,
    request: PackageLocationRequest,
    locations: ReadonlyMap<string, string>
): string {
    const parent = parentPackageDirectory(request, locations);
    if (parent !== undefined) {
        return parent;
    }
    const relative = relativeDirectoryInside(projectFolder, request.realPath);
    if (relative !== undefined && isNamedInstalledPackage(relative, request.name)) {
        return relative;
    }
    const nested = relativeDirectoryInside(request.fromFolder, request.realPath);
    return nested === undefined
        ? path.posix.join(installedDependenciesFolderName, request.name)
        : path.posix.join(request.targetFolder, nested);
}

export function createVendorPackageLocations(projectFolder: string): VendorPackageLocations {
    const locations = new Map<string, string>();
    return {
        locate(request) {
            const reachable = ancestorInstalledDependencyPathCandidates(
                path.resolve(path.sep, request.targetFolder),
                request.name
            )
                .map(function (candidate) {
                    return path.relative(path.sep, candidate).split(path.sep).join('/');
                });
            const existing = reachable.find(function (candidate) {
                return locations.get(candidate) === request.realPath;
            });
            if (existing !== undefined) {
                return { directory: existing, alreadyCollected: true };
            }
            const installed = installedDirectory(projectFolder, request, locations);
            const localDirectory = path.posix.join(request.targetFolder, installedDependenciesFolderName, request.name);
            const directory = locations.has(installed) || !reachable.includes(installed)
                ? localDirectory
                : installed;
            locations.set(directory, request.realPath);
            return { directory, alreadyCollected: false };
        }
    };
}
