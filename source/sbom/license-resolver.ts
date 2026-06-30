import { installedDependenciesFolderName, installedDependencyManifestPathIn } from '../common/package-layout.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import { extractLicenseFromManifest } from './extract-license.ts';

type LicenseResolverDependencies = {
    readonly fileManager: FileManager;
};

type LicenseResolveOptions = {
    readonly projectFolder: string;
    readonly dependencyName: string;
};

export type LicenseResolver = {
    resolveLicense: (options: LicenseResolveOptions) => Promise<string | undefined>;
};

function parseJsonString(content: string): unknown {
    return JSON.parse(content) as unknown;
}

export function createLicenseResolver(dependencies: LicenseResolverDependencies): LicenseResolver {
    const { fileManager } = dependencies;

    function buildMissingDependencyMessage(dependencyName: string): string {
        const intro = `Dependency "${dependencyName}" is declared in the published manifest`;
        return `${intro} but is not installed in ${installedDependenciesFolderName}`;
    }

    return {
        async resolveLicense({ projectFolder, dependencyName }) {
            const packageJsonPath = installedDependencyManifestPathIn(projectFolder, dependencyName);
            const readability = await fileManager.checkReadability(packageJsonPath);
            if (!readability.isReadable) {
                throw new Error(buildMissingDependencyMessage(dependencyName));
            }

            const parsed = parseJsonString(await fileManager.readFile(packageJsonPath));
            return extractLicenseFromManifest(parsed);
        }
    };
}
