import { indexBy, values } from 'remeda';
import type { PackageConfig, PackageConfigsByName, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import {
    resolveDeadCodeEliminationSettings,
    type DeadCodeEliminationSettings
} from '../config/dead-code-elimination-settings.ts';
import { explicitPackageSurface, implicitPackageSurface, type PackageSurface } from '../package-surface/surface.ts';
import type { ResourceResolveOptions } from '../resource-resolver/resource-resolve-options.ts';
import type { BuildVersionedBundleOptions } from '../version-manager/versioned-bundle.ts';
import { normalizeAdditionalFile, normalizeRoot } from './normalize-paths.ts';

export type PublishSettings = NonNullable<PackageConfig['publishSettings']>;
export type VersioningSettings = NonNullable<PackageConfig['versioning']>;
type AdditionalFileDescription = Extract<
    ResourceResolveOptions['additionalFiles'][number],
    { readonly sourceFilePath: string; readonly targetFilePath: string }
>;
type ManifestOptionsSubset = Pick<
    BuildVersionedBundleOptions,
    'additionalPackageJsonAttributes' | 'allowMutableSpecifiers' | 'mainPackageJson'
>;

export type SharedPackageOptions<TBundle extends { name: string }> = ManifestOptionsSubset &
    ResourceResolveOptions & {
        readonly bundleDependencies: readonly TBundle[];
        readonly bundlePeerDependencies: readonly TBundle[];
        readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
    };

export type PreparedPackageOptions<TBundle extends { name: string }> = {
    readonly packageConfig: PackageConfig;
    readonly sharedOptions: SharedPackageOptions<TBundle>;
    readonly versioning: VersioningSettings;
};

function dependencyNamesToBundles<TBundle extends { name: string }>(
    dependencyNames: readonly string[],
    bundles: readonly TBundle[]
): readonly TBundle[] {
    const bundlesByName = indexBy(bundles, (bundle) => {
        return bundle.name;
    });

    return dependencyNames.map((dependencyName) => {
        const matchingBundle = bundlesByName[dependencyName];
        if (matchingBundle === undefined) {
            throw new Error(`Dependent bundle "${dependencyName}" not found`);
        }
        return matchingBundle;
    });
}

function mergeAdditionalFiles(
    firstFiles: readonly AdditionalFileDescription[] = [],
    secondFiles: readonly AdditionalFileDescription[] = []
): readonly AdditionalFileDescription[] {
    return values(
        indexBy([...firstFiles, ...secondFiles], (file) => {
            return file.targetFilePath;
        })
    );
}

function getRequiredArrayValue<TValue>(
    items: readonly TValue[],
    message: string
): readonly [TValue, ...(readonly TValue[])] {
    const [firstValue, ...remainingValues] = items;
    if (firstValue === undefined) {
        throw new Error(message);
    }
    return [firstValue, ...remainingValues];
}

function getRequiredValue<TValue>(value: TValue | undefined, message: string): TValue {
    if (value === undefined) {
        throw new Error(message);
    }

    return value;
}

function mapRequiredArrayValue<TInput, TOutput>(
    items: readonly [TInput, ...(readonly TInput[])],
    mapper: (item: TInput) => TOutput
): readonly [TOutput, ...(readonly TOutput[])] {
    const [firstItem, ...remainingItems] = items;
    return [mapper(firstItem), ...remainingItems.map(mapper)];
}

function resolveDefaultModuleRoot(
    rootIds: readonly [string, ...(readonly string[])],
    packageConfig: PackageConfig
): string {
    const [firstRootId, secondRootId] = rootIds;
    if (secondRootId === undefined) {
        return firstRootId;
    }

    return getRequiredValue(
        packageConfig.defaultModuleRoot,
        `Config for package "${packageConfig.name}" is missing defaultModuleRoot`
    );
}

function resolveSurface(
    rootIds: readonly [string, ...(readonly string[])],
    packageConfig: PackageConfig
): PackageSurface {
    if (packageConfig.packageInterface === undefined) {
        return implicitPackageSurface(resolveDefaultModuleRoot(rootIds, packageConfig));
    }

    return explicitPackageSurface(packageConfig.packageInterface);
}

function getPackageConfig(packageName: string, packageConfigs: PackageConfigsByName): PackageConfig {
    const packageConfig = packageConfigs[packageName];

    if (packageConfig === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }

    return packageConfig;
}

function resolveSourcesFolder(packageConfig: PackageConfig, packtoryConfig: PacktoryConfigWithoutRegistry): string {
    return getRequiredValue(
        packageConfig.sourcesFolder ?? packtoryConfig.commonPackageSettings?.sourcesFolder,
        `Config for package "${packageConfig.name}" is missing the sources folder`
    );
}

function resolveMainPackageJson(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): ManifestOptionsSubset['mainPackageJson'] {
    return getRequiredValue(
        packageConfig.mainPackageJson ?? packtoryConfig.commonPackageSettings?.mainPackageJson,
        `Config for package "${packageConfig.name}" is missing the main package.json settings`
    );
}

export function resolvePublishSettings(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): PublishSettings {
    return getRequiredValue(
        packageConfig.publishSettings ?? packtoryConfig.commonPackageSettings?.publishSettings,
        `Config for package "${packageConfig.name}" is missing publish settings`
    );
}

function resolveAllowMutableSpecifiers(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): readonly string[] {
    const dependencyPolicy = packageConfig.dependencyPolicy ?? packtoryConfig.commonPackageSettings?.dependencyPolicy;
    return dependencyPolicy?.allowMutableSpecifiers ?? [];
}

function buildAdditionalPackageJsonAttributes(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): ManifestOptionsSubset['additionalPackageJsonAttributes'] {
    return {
        ...packtoryConfig.commonPackageSettings?.additionalPackageJsonAttributes,
        ...packageConfig.additionalPackageJsonAttributes
    };
}

function resolveIncludeSourceMapFiles(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): boolean {
    return packageConfig.includeSourceMapFiles ?? packtoryConfig.commonPackageSettings?.includeSourceMapFiles ?? false;
}

function resolveAdditionalFiles(
    packageConfig: PackageConfig,
    sourcesFolder: string,
    packtoryConfig: PacktoryConfigWithoutRegistry
): readonly AdditionalFileDescription[] {
    return mergeAdditionalFiles(
        packtoryConfig.commonPackageSettings?.additionalFiles,
        packageConfig.additionalFiles
    ).map((additionalFile) => {
        return normalizeAdditionalFile(additionalFile, sourcesFolder);
    });
}

function resolveDeadCodeElimination(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): SharedPackageOptions<{ name: string }>['deadCodeElimination'] {
    return resolveDeadCodeEliminationSettings(
        packageConfig.deadCodeElimination,
        packtoryConfig.commonPackageSettings?.deadCodeElimination
    );
}

function resolveBundleDependencies<TBundle extends { name: string }>(
    packageConfig: PackageConfig,
    existingBundles: readonly TBundle[]
): Pick<SharedPackageOptions<TBundle>, 'bundleDependencies' | 'bundlePeerDependencies'> {
    return {
        bundleDependencies: dependencyNamesToBundles(packageConfig.bundleDependencies ?? [], existingBundles),
        bundlePeerDependencies: dependencyNamesToBundles(packageConfig.bundlePeerDependencies ?? [], existingBundles)
    };
}

function buildSharedOptions<TBundle extends { name: string }>(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly TBundle[]
): SharedPackageOptions<TBundle> {
    const sourcesFolder = resolveSourcesFolder(packageConfig, packtoryConfig);
    const mainPackageJson = resolveMainPackageJson(packageConfig, packtoryConfig);
    const bundleDependencies = resolveBundleDependencies(packageConfig, existingBundles);
    const normalizedRootEntries = getRequiredArrayValue(
        Object.entries(packageConfig.roots).map(([rootId, root]) => {
            return [rootId, normalizeRoot(root, sourcesFolder)] as const;
        }),
        `Package "${packageConfig.name}" must define at least one root`
    );

    const roots = Object.fromEntries(normalizedRootEntries) as ResourceResolveOptions['roots'];
    const rootIds = mapRequiredArrayValue(normalizedRootEntries, ([rootId]) => {
        return rootId;
    });
    const surface = resolveSurface(rootIds, packageConfig);

    return {
        name: packageConfig.name,
        roots,
        surface,
        sourcesFolder,
        includeSourceMapFiles: resolveIncludeSourceMapFiles(packageConfig, packtoryConfig),
        additionalFiles: resolveAdditionalFiles(packageConfig, sourcesFolder, packtoryConfig),
        mainPackageJson,
        additionalPackageJsonAttributes: buildAdditionalPackageJsonAttributes(packageConfig, packtoryConfig),
        allowMutableSpecifiers: resolveAllowMutableSpecifiers(packageConfig, packtoryConfig),
        deadCodeElimination: resolveDeadCodeElimination(packageConfig, packtoryConfig),
        ...bundleDependencies
    };
}

export function preparePackageOptions<TBundle extends { name: string }>(
    packageName: string,
    packageConfigs: PackageConfigsByName,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly TBundle[]
): PreparedPackageOptions<TBundle> {
    const packageConfig = getPackageConfig(packageName, packageConfigs);
    const sharedOptions = buildSharedOptions(packageConfig, packtoryConfig, existingBundles);
    const versioning = packageConfig.versioning ?? { automatic: true };

    return { packageConfig, sharedOptions, versioning };
}
