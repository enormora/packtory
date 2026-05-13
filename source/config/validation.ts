import { Result } from 'true-myth';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { indexBy } from 'remeda';
import type { ZodMiniType } from 'zod/mini';
import { type DirectedGraph, createDirectedGraph } from '../directed-graph/graph.ts';
import {
    getBundledDependencies,
    type PacktoryConfig,
    type PackageConfig,
    type PackageConfigsByName,
    type PacktoryConfigWithoutRegistry
} from './config.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

function buildPackageGraph(packages: PackageConfigsByName): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    for (const packageConfig of Object.values(packages)) {
        graph.addNode(packageConfig.name, undefined);
    }

    for (const packageConfig of Object.values(packages)) {
        for (const dependency of getBundledDependencies(packageConfig)) {
            graph.connect({ from: packageConfig.name, to: dependency });
        }
    }

    return graph;
}

function validateDependenciesExistForSinglePackage(
    packageName: string,
    allKnownPackageNames: readonly string[],
    dependencies: readonly string[],
    isPeer: boolean
): readonly string[] {
    const prefix = isPeer ? 'Bundle peer' : 'Bundle';

    return dependencies
        .filter((dependency) => {
            return !allKnownPackageNames.includes(dependency);
        })
        .map((dependency) => {
            return `${prefix} dependency "${dependency}" referenced in "${packageName}" does not exist`;
        });
}

function validateDependenciesExist(packageConfigs: PackageConfigsByName): readonly string[] {
    const knownPackageNames = Object.keys(packageConfigs);
    return Object.values(packageConfigs).flatMap((packageConfig) => {
        return [
            ...validateDependenciesExistForSinglePackage(
                packageConfig.name,
                knownPackageNames,
                packageConfig.bundleDependencies ?? [],
                false
            ),
            ...validateDependenciesExistForSinglePackage(
                packageConfig.name,
                knownPackageNames,
                packageConfig.bundlePeerDependencies ?? [],
                true
            )
        ];
    });
}

function validateDuplicateRootJavaScriptTargets(packageConfig: PackageConfig): readonly string[] {
    const issues: string[] = [];
    const rootEntries = Object.entries(packageConfig.roots);
    const jsPaths = new Map<string, string>();

    for (const [rootId, root] of rootEntries) {
        const previous = jsPaths.get(root.js);
        if (previous === undefined) {
            jsPaths.set(root.js, rootId);
        } else {
            issues.push(`Package "${packageConfig.name}" maps both root "${previous}" and "${rootId}" to "${root.js}"`);
        }
    }

    return issues;
}

function validateImplicitRootConfiguration(packageConfig: ImplicitPackageConfig): readonly string[] {
    const rootIds = Object.keys(packageConfig.roots);
    const issues: string[] = [];
    const { defaultModuleRoot } = packageConfig;

    if (rootIds.length > 1 && defaultModuleRoot === undefined) {
        issues.push(`Package "${packageConfig.name}" must define defaultModuleRoot when multiple roots exist`);
    }

    if (defaultModuleRoot !== undefined && packageConfig.roots[defaultModuleRoot] === undefined) {
        issues.push(`Package "${packageConfig.name}" references unknown defaultModuleRoot "${defaultModuleRoot}"`);
    }

    return issues;
}

type ExplicitValidationState = {
    readonly usedRootIds: Set<string>;
    readonly seenExportKeys: Set<string>;
    readonly seenBinNames: Set<string>;
};

function createExplicitValidationState(): ExplicitValidationState {
    return {
        usedRootIds: new Set<string>(),
        seenExportKeys: new Set<string>(),
        seenBinNames: new Set<string>()
    };
}

function validateExplicitModules(
    packageConfig: ExplicitPackageConfig,
    state: ExplicitValidationState
): readonly string[] {
    const issues: string[] = [];

    for (const entry of packageConfig.packageInterface.modules ?? []) {
        if (packageConfig.roots[entry.root] === undefined) {
            issues.push(
                [
                    `Package "${packageConfig.name}" module export "${entry.export}"`,
                    `references unknown root "${entry.root}"`
                ].join(' ')
            );
        }
        if (state.seenExportKeys.has(entry.export)) {
            issues.push(`Package "${packageConfig.name}" declares duplicate export key "${entry.export}"`);
        }
        state.seenExportKeys.add(entry.export);
        state.usedRootIds.add(entry.root);
    }

    return issues;
}

function validateExplicitBins(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): readonly string[] {
    const issues: string[] = [];

    for (const entry of packageConfig.packageInterface.bins ?? []) {
        if (packageConfig.roots[entry.root] === undefined) {
            issues.push(`Package "${packageConfig.name}" bin "${entry.name}" references unknown root "${entry.root}"`);
        }
        if (state.seenBinNames.has(entry.name)) {
            issues.push(`Package "${packageConfig.name}" declares duplicate bin name "${entry.name}"`);
        }
        state.seenBinNames.add(entry.name);
        state.usedRootIds.add(entry.root);
    }

    return issues;
}

function validateExplicitUnusedRoots(
    packageConfig: ExplicitPackageConfig,
    state: ExplicitValidationState
): readonly string[] {
    return Object.keys(packageConfig.roots).flatMap((rootId) => {
        if (state.usedRootIds.has(rootId)) {
            return [];
        }
        return [`Package "${packageConfig.name}" defines unused root "${rootId}" in explicit mode`];
    });
}

function validateExplicitRootConfiguration(packageConfig: ExplicitPackageConfig): readonly string[] {
    const state = createExplicitValidationState();

    return [
        ...validateExplicitModules(packageConfig, state),
        ...validateExplicitBins(packageConfig, state),
        ...validateExplicitUnusedRoots(packageConfig, state)
    ];
}

function validateRootConfiguration(packageConfig: PackageConfig): readonly string[] {
    const duplicateRootIssues = validateDuplicateRootJavaScriptTargets(packageConfig);

    if (packageConfig.packageInterface === undefined) {
        return [...duplicateRootIssues, ...validateImplicitRootConfiguration(packageConfig)];
    }

    return [...duplicateRootIssues, ...validateExplicitRootConfiguration(packageConfig)];
}

function packageListToRecord(packages: readonly PackageConfig[]): PackageConfigsByName {
    return indexBy(packages, (packageConfig) => {
        return packageConfig.name;
    });
}

function validateDuplicatePackages(packages: readonly PackageConfig[]): readonly string[] {
    const knownPackageNames = new Set<string>();
    const issues: string[] = [];

    packages.forEach((packageConfig) => {
        if (knownPackageNames.has(packageConfig.name)) {
            issues.push(`Duplicate package definition with the name "${packageConfig.name}"`);
        }
        knownPackageNames.add(packageConfig.name);
    });

    return issues;
}

function validateCyclicDependencies(packageGraph: DirectedGraph<string, undefined>): readonly string[] {
    const cycles = packageGraph.detectCycles();
    return cycles.map((cycle) => {
        return `Unexpected cyclic dependency path: [${cycle.join('→')}]`;
    });
}

type GraphGenerationPossibleResult<TConfig extends { packages: readonly PackageConfig[] }> = {
    readonly packtoryConfig: TConfig;
    readonly packageConfigs: PackageConfigsByName;
};

type ConfigWithGraphInternal<TConfig extends { packages: readonly PackageConfig[] }> =
    GraphGenerationPossibleResult<TConfig> & {
        readonly packageGraph: DirectedGraph<string, undefined>;
    };

type ImplicitPackageConfig = Extract<PackageConfig, { readonly packageInterface?: undefined }>;
type ExplicitPackageConfig = Extract<
    PackageConfig,
    { readonly packageInterface: NonNullable<PackageConfig['packageInterface']> }
>;

function validatePublishSettingsArePlaced(packtoryConfig: Readonly<PacktoryConfigWithoutRegistry>): readonly string[] {
    if (packtoryConfig.commonPackageSettings?.publishSettings !== undefined) {
        return [];
    }
    const everyPackageHasIt = packtoryConfig.packages.every((packageConfig) => {
        return packageConfig.publishSettings !== undefined;
    });
    if (everyPackageHasIt) {
        return [];
    }
    return ['publishSettings must be set in commonPackageSettings or in every package'];
}

function validatePackageSurfaceRules(packageConfigs: PackageConfigsByName): readonly string[] {
    return Object.values(packageConfigs).flatMap(validateRootConfiguration);
}

function validateAllowScriptsConsistency(packtoryConfig: Readonly<PacktoryConfigWithoutRegistry>): readonly string[] {
    const commonAttributes = packtoryConfig.commonPackageSettings?.additionalPackageJsonAttributes;
    const commonPublishSettings = packtoryConfig.commonPackageSettings?.publishSettings;

    return packtoryConfig.packages.flatMap((packageConfig) => {
        const mergedAttributes = { ...commonAttributes, ...packageConfig.additionalPackageJsonAttributes };
        const resolvedPublishSettings = packageConfig.publishSettings ?? commonPublishSettings;

        if (!('scripts' in mergedAttributes)) {
            return [];
        }
        if (resolvedPublishSettings?.allowScripts === true) {
            return [];
        }
        const prefix = `Package "${packageConfig.name}": "scripts" in additionalPackageJsonAttributes`;
        return [`${prefix} requires "publishSettings.allowScripts: true"`];
    });
}

function validatePreGraphGenerationWithSchema<TConfig extends PacktoryConfigWithoutRegistry>(
    schema: ZodMiniType,
    config: unknown
): Result<GraphGenerationPossibleResult<TConfig>, readonly string[]> {
    const schemaValidationResult = safeParse(schema, config);

    if (!schemaValidationResult.success) {
        return Result.err(schemaValidationResult.error.issues);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- callers bind the expected config type for this schema
    const packtoryConfig = schemaValidationResult.data as TConfig;
    const packageConfigs = packageListToRecord(packtoryConfig.packages);

    const preGraphIssues = [
        ...validatePublishSettingsArePlaced(packtoryConfig),
        ...validateAllowScriptsConsistency(packtoryConfig),
        ...validateDependenciesExist(packageConfigs),
        ...validatePackageSurfaceRules(packageConfigs)
    ];
    if (preGraphIssues.length > 0) {
        return Result.err([...validateDuplicatePackages(packtoryConfig.packages), ...preGraphIssues]);
    }

    return Result.ok({
        packtoryConfig,
        packageConfigs
    });
}

function finalizeValidation<TConfig extends { packages: readonly PackageConfig[] }>(
    result: Result<GraphGenerationPossibleResult<TConfig>, readonly string[]>
): Result<ConfigWithGraphInternal<TConfig>, readonly string[]> {
    if (result.isErr) {
        return Result.err(result.error);
    }

    const { packageConfigs, packtoryConfig } = result.value;

    const packageGraph = buildPackageGraph(packageConfigs);

    const issues = Array.from(validateDuplicatePackages(packtoryConfig.packages));
    issues.push(...validateCyclicDependencies(packageGraph));
    if (issues.length > 0) {
        return Result.err(issues);
    }

    return Result.ok({
        packtoryConfig,
        packageConfigs,
        packageGraph
    });
}

export type ConfigWithGraph<TConfig extends { packages: readonly PackageConfig[] }> = ConfigWithGraphInternal<TConfig>;
export type ValidConfigResult = ConfigWithGraph<PacktoryConfig>;
export type ValidConfigWithoutRegistryResult = ConfigWithGraph<PacktoryConfigWithoutRegistry>;

export function validateConfig(config: unknown): Result<ValidConfigResult, readonly string[]> {
    const result = validatePreGraphGenerationWithSchema<PacktoryConfig>(packtoryConfigSchema, config);
    return finalizeValidation(result);
}

export function validateConfigWithoutRegistry(
    config: unknown
): Result<ValidConfigWithoutRegistryResult, readonly string[]> {
    const result = validatePreGraphGenerationWithSchema<PacktoryConfigWithoutRegistry>(
        packtoryConfigWithoutRegistrySchema,
        config
    );
    return finalizeValidation(result);
}
