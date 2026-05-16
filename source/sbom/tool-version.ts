import path from 'node:path';
import { isPlainObject } from 'remeda';
import type { FileManager } from '../file-manager/file-manager.ts';

const candidatePackageNames = ['@packtory/cli', 'packtory'] as const;
const nodeModulesSegment = 'node_modules';
const packageJsonFileName = 'package.json';
const pathSeparators = /[/\\]/u;

type ToolVersionResolverDependencies = {
    readonly fileManager: FileManager;
    readonly resolvePackagePath: (specifier: string) => string | undefined;
    readonly fallbackPackageJsonPath?: string;
};

type CandidatePackageName = (typeof candidatePackageNames)[number];

type ResolvedToolPackageJson = {
    readonly name: CandidatePackageName;
    readonly version: string;
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

function isPackageRootDirectory(directoryPath: string): boolean {
    const parent = path.dirname(directoryPath);
    if (path.basename(parent) === nodeModulesSegment) {
        return true;
    }
    const grandParent = path.dirname(parent);
    return path.basename(parent).startsWith('@') && path.basename(grandParent) === nodeModulesSegment;
}

function packageJsonPathForResolvedPackageEntry(resolvedPath: string): string {
    let currentDirectory = path.dirname(resolvedPath);
    const rootDirectory = path.parse(currentDirectory).root;
    const candidateDirectories = Array.from({ length: currentDirectory.split(pathSeparators).length }, () => {
        const candidate = currentDirectory;
        currentDirectory = path.dirname(currentDirectory);
        return candidate;
    });
    const packageRoot = candidateDirectories.find(isPackageRootDirectory);
    if (packageRoot !== undefined) {
        return path.join(packageRoot, packageJsonFileName);
    }
    return path.join(rootDirectory, packageJsonFileName);
}

function resolveInstalledPackageJsonPath(
    candidatePackageName: string,
    resolvePackagePath: ToolVersionResolverDependencies['resolvePackagePath']
): string | undefined {
    const resolvedPackageJson = resolvePackagePath(`${candidatePackageName}/package.json`);
    if (resolvedPackageJson !== undefined) {
        return resolvedPackageJson;
    }
    const resolvedPackageEntry = resolvePackagePath(candidatePackageName);
    if (resolvedPackageEntry !== undefined) {
        return packageJsonPathForResolvedPackageEntry(resolvedPackageEntry);
    }
    return undefined;
}

function findInstalledPackagePath(
    resolvePackagePath: ToolVersionResolverDependencies['resolvePackagePath']
): string | undefined {
    for (const candidatePackageName of candidatePackageNames) {
        const resolved = resolveInstalledPackageJsonPath(candidatePackageName, resolvePackagePath);
        if (resolved !== undefined) {
            return resolved;
        }
    }
    return undefined;
}

function assertSupportedPackageJsonPath(packageJsonPath: string, fallbackPackageJsonPath?: string): void {
    if (fallbackPackageJsonPath === packageJsonPath || isInsideNodeModules(packageJsonPath)) {
        return;
    }
    throw new Error(buildOutsideNodeModulesMessage(packageJsonPath));
}

function isCandidatePackageName(value: unknown): value is CandidatePackageName {
    return value === '@packtory/cli' || value === 'packtory';
}

function parseToolPackageJson(packageJsonPath: string, content: string): ResolvedToolPackageJson {
    const parsed: unknown = JSON.parse(content);
    if (!isPlainObject(parsed) || typeof parsed.version !== 'string') {
        throw new Error(`Resolved packtory package.json at "${packageJsonPath}" is missing a version field`);
    }
    if (!isCandidatePackageName(parsed.name)) {
        throw new Error(`Resolved packtory package.json at "${packageJsonPath}" has unexpected package name`);
    }
    return { name: parsed.name, version: parsed.version };
}

export function createPacktoryToolVersionResolver(
    dependencies: ToolVersionResolverDependencies
): () => Promise<string> {
    const { fileManager, resolvePackagePath, fallbackPackageJsonPath } = dependencies;

    return async function resolvePacktoryToolVersion(): Promise<string> {
        const packageJsonPath = findInstalledPackagePath(resolvePackagePath) ?? fallbackPackageJsonPath;
        if (packageJsonPath === undefined) {
            throw new Error(buildUnresolvableMessage());
        }
        assertSupportedPackageJsonPath(packageJsonPath, fallbackPackageJsonPath);
        const content = await fileManager.readFile(packageJsonPath);
        return parseToolPackageJson(packageJsonPath, content).version;
    };
}
