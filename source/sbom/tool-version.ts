import { isPlainObject } from 'remeda';
import type { FileManager } from '../file-manager/file-manager.ts';

const candidatePackageNames = ['@packtory/cli', 'packtory'] as const;
const nodeModulesSegment = 'node_modules';
const pathSeparators = /[/\\]/u;

type ToolVersionResolverDependencies = {
    readonly fileManager: FileManager;
    readonly resolvePackagePath: (specifier: string) => string | undefined;
};

function isInsideNodeModules(filePath: string): boolean {
    return filePath.split(pathSeparators).includes(nodeModulesSegment);
}

function buildUnresolvableMessage(): string {
    const intro = 'Cannot determine packtory tool version: neither "@packtory/cli" nor "packtory" is resolvable.';
    return `${intro} Install packtory via npm so it lives under node_modules/.`;
}

function buildOutsideNodeModulesMessage(packageJsonPath: string): string {
    const intro = `Refusing to read packtory tool version from "${packageJsonPath}":`;
    const reason = 'the resolved package.json is not inside a node_modules folder.';
    return `${intro} ${reason} Install packtory via npm to make its real version available.`;
}

function findInstalledPackagePath(
    resolvePackagePath: ToolVersionResolverDependencies['resolvePackagePath']
): string | undefined {
    for (const candidatePackageName of candidatePackageNames) {
        const resolved = resolvePackagePath(`${candidatePackageName}/package.json`);
        if (resolved !== undefined) {
            return resolved;
        }
    }
    return undefined;
}

export function createPacktoryToolVersionResolver(
    dependencies: ToolVersionResolverDependencies
): () => Promise<string> {
    const { fileManager, resolvePackagePath } = dependencies;

    return async function resolvePacktoryToolVersion(): Promise<string> {
        const packageJsonPath = findInstalledPackagePath(resolvePackagePath);
        if (packageJsonPath === undefined) {
            throw new Error(buildUnresolvableMessage());
        }
        if (!isInsideNodeModules(packageJsonPath)) {
            throw new Error(buildOutsideNodeModulesMessage(packageJsonPath));
        }

        const content = await fileManager.readFile(packageJsonPath);
        const parsed: unknown = JSON.parse(content);
        if (!isPlainObject(parsed) || typeof parsed.version !== 'string') {
            throw new Error(`Resolved packtory package.json at "${packageJsonPath}" is missing a version field`);
        }
        return parsed.version;
    };
}
