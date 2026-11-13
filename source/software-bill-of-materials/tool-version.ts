import { isObjectType, isPlainObject } from 'remeda';

const candidatePackageNames = [ '@packtory/cli', 'packtory' ] as const;

type ToolVersionResolverDependencies = {
    readonly importPackageManifest: (specifier: string) => Promise<unknown>;
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
    if (!isObjectType(error) || !Object.hasOwn(error, 'code')) {
        return false;
    }

    const code: unknown = Reflect.get(error, 'code');
    return code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
}

function unwrapJavaScriptObjectNotationModule(importedModule: unknown): unknown {
    if (!isPlainObject(importedModule) || !Object.hasOwn(importedModule, 'default')) {
        return importedModule;
    }

    return importedModule.default;
}

function parseToolPackageManifest(specifier: string, importedModule: unknown): string {
    const parsed = unwrapJavaScriptObjectNotationModule(importedModule);
    if (!isPlainObject(parsed) || typeof parsed.version !== 'string') {
        throw new Error(`Imported packtory package.json from "${specifier}" is missing a version field`);
    }
    if (!isCandidatePackageName(parsed.name)) {
        throw new Error(`Imported packtory package.json from "${specifier}" has unexpected package name`);
    }
    return parsed.version;
}

async function resolveCandidateVersion(
    importPackageManifest: ToolVersionResolverDependencies['importPackageManifest'],
    candidatePackageName: CandidatePackageName
): Promise<string | undefined> {
    const specifier = `${candidatePackageName}/package.json`;
    try {
        return parseToolPackageManifest(specifier, await importPackageManifest(specifier));
    } catch (error: unknown) {
        if (!isImportResolutionError(error)) {
            throw error;
        }
        return undefined;
    }
}

export function createPacktoryToolVersionResolver(
    dependencies: ToolVersionResolverDependencies
): () => Promise<string> {
    const { importPackageManifest } = dependencies;

    return async function resolvePacktoryToolVersion(): Promise<string> {
        for (const candidatePackageName of candidatePackageNames) {
            const version = await resolveCandidateVersion(importPackageManifest, candidatePackageName);
            if (version !== undefined) {
                return version;
            }
        }
        throw new Error(buildUnresolvableMessage());
    };
}

export function createPacktoryAnalysisIdentityResolver(
    dependencies: ToolVersionResolverDependencies
): () => Promise<string> {
    return async function () {
        const identities: string[] = [];
        for (const candidate of candidatePackageNames) {
            const version = await resolveCandidateVersion(dependencies.importPackageManifest, candidate);
            if (version !== undefined) {
                identities.push(`${candidate}@${version}`);
            }
        }
        if (identities.length === 0) {
            throw new Error(buildUnresolvableMessage());
        }
        return JSON.stringify(identities);
    };
}
