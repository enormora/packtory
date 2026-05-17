import { isObjectType, isPlainObject } from 'remeda';

const candidatePackageNames = ['@packtory/cli', 'packtory'] as const;

type ToolVersionResolverDependencies = {
    readonly importPackageJson: (specifier: string) => Promise<unknown>;
};

type CandidatePackageName = (typeof candidatePackageNames)[number];

function buildUnresolvableMessage(): string {
    const intro = 'Cannot determine packtory tool version: neither "@packtory/cli" nor "packtory" is resolvable.';
    return `${intro} Install packtory via npm so it lives under node_modules/.`;
}

function isCandidatePackageName(value: unknown): value is CandidatePackageName {
    return value === '@packtory/cli' || value === 'packtory';
}

function isImportResolutionError(error: unknown): boolean {
    if (!isObjectType(error) || !('code' in error)) {
        return false;
    }

    const { code } = error;
    return code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
}

function unwrapJsonModule(importedModule: unknown): unknown {
    if (!isPlainObject(importedModule) || !('default' in importedModule)) {
        return importedModule;
    }

    return importedModule.default;
}

function parseToolPackageJson(specifier: string, importedModule: unknown): string {
    const parsed = unwrapJsonModule(importedModule);
    if (!isPlainObject(parsed) || typeof parsed.version !== 'string') {
        throw new Error(`Imported packtory package.json from "${specifier}" is missing a version field`);
    }
    if (!isCandidatePackageName(parsed.name)) {
        throw new Error(`Imported packtory package.json from "${specifier}" has unexpected package name`);
    }
    return parsed.version;
}

export function createPacktoryToolVersionResolver(
    dependencies: ToolVersionResolverDependencies
): () => Promise<string> {
    const { importPackageJson } = dependencies;

    return async function resolvePacktoryToolVersion(): Promise<string> {
        for (const candidatePackageName of candidatePackageNames) {
            const specifier = `${candidatePackageName}/package.json`;
            try {
                return parseToolPackageJson(specifier, await importPackageJson(specifier));
            } catch (error: unknown) {
                if (!isImportResolutionError(error)) {
                    throw error;
                }
            }
        }
        throw new Error(buildUnresolvableMessage());
    };
}
