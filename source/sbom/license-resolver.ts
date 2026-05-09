import path from 'node:path';
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

export function createLicenseResolver(dependencies: LicenseResolverDependencies): LicenseResolver {
    const { fileManager } = dependencies;

    function buildMissingDependencyMessage(dependencyName: string): string {
        const intro = `Dependency "${dependencyName}" is declared in the published manifest`;
        return `${intro} but is not installed in node_modules`;
    }

    return {
        async resolveLicense({ projectFolder, dependencyName }) {
            const packageJsonPath = path.join(projectFolder, 'node_modules', dependencyName, 'package.json');
            const readability = await fileManager.checkReadability(packageJsonPath);
            if (!readability.isReadable) {
                throw new Error(buildMissingDependencyMessage(dependencyName));
            }

            const content = await fileManager.readFile(packageJsonPath);
            const parsed = JSON.parse(content) as unknown;
            return extractLicenseFromManifest(parsed);
        }
    };
}
