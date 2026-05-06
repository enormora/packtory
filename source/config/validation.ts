import { Result } from 'true-myth';
import { safeParse } from '@schema-hub/zod-error-formatter';
import type { ZodMiniType } from 'zod/mini';
import { type DirectedGraph, createDirectedGraph } from '../directed-graph/graph.ts';
import {
    getBundledDependencies,
    type ChecksSettings,
    type PacktoryConfig,
    type PackageConfig,
    type PacktoryConfigWithoutRegistry
} from './config.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';

function buildPackageGraph(packages: ReadonlyMap<string, PackageConfig>): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    for (const packageConfig of packages.values()) {
        graph.addNode(packageConfig.name, undefined);
    }

    for (const packageConfig of packages.values()) {
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

function validateDependenciesExist(packageConfigs: Map<string, PackageConfig>): readonly string[] {
    const knownPackageNames = Array.from(packageConfigs.keys());
    return Array.from(packageConfigs.values()).flatMap((packageConfig) => {
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

function packageListToMap(packages: readonly PackageConfig[]): Map<string, PackageConfig> {
    return packages.reduce((map, packageConfig) => {
        map.set(packageConfig.name, packageConfig);
        return map;
    }, new Map<string, PackageConfig>());
}

function validateNoDuplicatedFilesAllowList(
    packageConfigs: ReadonlyMap<string, PackageConfig>,
    checks: ChecksSettings | undefined
): readonly string[] {
    const allowList = checks?.noDuplicatedFiles?.allowList;
    if (allowList === undefined) {
        return [];
    }
    return allowList.flatMap((entry) => {
        if (typeof entry === 'string') {
            return [];
        }
        return entry.packages
            .filter((name) => {
                return !packageConfigs.has(name);
            })
            .map((name) => {
                return `Allow list entry for "${entry.filePath}" references unknown package "${name}"`;
            });
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
    readonly packageConfigs: Map<string, PackageConfig>;
};

type ConfigWithGraphInternal<TConfig extends { packages: readonly PackageConfig[] }> =
    GraphGenerationPossibleResult<TConfig> & {
        readonly packageGraph: DirectedGraph<string, undefined>;
    };

function validatePreGraphGenerationWithSchema<TConfig extends PacktoryConfigWithoutRegistry>(
    schema: ZodMiniType<TConfig>,
    config: unknown
): Result<GraphGenerationPossibleResult<TConfig>, readonly string[]> {
    const schemaValidationResult = safeParse(schema, config);

    if (!schemaValidationResult.success) {
        return Result.err(schemaValidationResult.error.issues);
    }

    const packtoryConfig: TConfig = schemaValidationResult.data;
    const packageConfigs = packageListToMap(packtoryConfig.packages);

    const preGraphIssues = [
        ...validateDependenciesExist(packageConfigs),
        ...validateNoDuplicatedFilesAllowList(packageConfigs, packtoryConfig.checks)
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
