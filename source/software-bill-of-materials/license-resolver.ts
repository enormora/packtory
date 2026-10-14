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

function parseJavaScriptObjectNotationString(content: string): unknown {
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
            const packageManifestPath = installedDependencyManifestPathIn(projectFolder, dependencyName);
            const readability = await fileManager.checkReadability(packageManifestPath);
            if (!readability.isReadable) {
                throw new Error(buildMissingDependencyMessage(dependencyName));
            }

            const parsed = parseJavaScriptObjectNotationString(await fileManager.readFile(packageManifestPath));
            return extractLicenseFromManifest(parsed);
        }
    };
}
