import { Result } from 'true-myth';
import type { ZodMiniType } from 'zod/mini';
import { safeParse } from '../common/schema-validation.ts';
import type { DirectedGraph } from '../directed-graph/graph.ts';
import type { PackageConfig, PackageConfigsByName, PacktoryConfig, PacktoryConfigWithoutRegistry } from './config.ts';
import { validateCyclicDependencies, validateDuplicatePackages } from './cross-package-validation.ts';
import { buildPackageGraph } from './package-graph-builder.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import { packtoryConfigWithoutRegistrySchema } from './packtory-config-without-registry-schema.ts';
import { collectPreGraphIssues, packageListToRecord } from './pre-graph-validation.ts';

type GraphGenerationPossibleResult<TConfig extends { packages: readonly PackageConfig[] }> = {
    readonly packtoryConfig: TConfig;
    readonly packageConfigs: PackageConfigsByName;
};

type ConfigWithGraphInternal<TConfig extends { packages: readonly PackageConfig[] }> =
    GraphGenerationPossibleResult<TConfig> & {
        readonly packageGraph: DirectedGraph<string, undefined>;
    };

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

    const preGraphIssues = collectPreGraphIssues(packtoryConfig);
    if (preGraphIssues.length > 0) {
        return Result.err([...validateDuplicatePackages(packtoryConfig.packages), ...preGraphIssues]);
    }

    return Result.ok({ packtoryConfig, packageConfigs });
}

function finalizeValidation<TConfig extends { packages: readonly PackageConfig[] }>(
    result: Result<GraphGenerationPossibleResult<TConfig>, readonly string[]>
): Result<ConfigWithGraphInternal<TConfig>, readonly string[]> {
    if (result.isErr) {
        return Result.err(result.error);
    }

    const { packageConfigs, packtoryConfig } = result.value;
    const packageGraph = buildPackageGraph(packageConfigs);

    const issues = [...validateDuplicatePackages(packtoryConfig.packages), ...validateCyclicDependencies(packageGraph)];
    if (issues.length > 0) {
        return Result.err(issues);
    }

    return Result.ok({ packtoryConfig, packageConfigs, packageGraph });
}

export type ConfigWithGraph<TConfig extends { packages: readonly PackageConfig[] }> = ConfigWithGraphInternal<TConfig>;
export type ValidConfigResult = ConfigWithGraph<PacktoryConfig>;
export type ValidConfigWithoutRegistryResult = ConfigWithGraph<PacktoryConfigWithoutRegistry>;

export function validateConfig(config: unknown): Result<ValidConfigResult, readonly string[]> {
    return finalizeValidation(validatePreGraphGenerationWithSchema<PacktoryConfig>(packtoryConfigSchema, config));
}

export function validateConfigWithoutRegistry(
    config: unknown
): Result<ValidConfigWithoutRegistryResult, readonly string[]> {
    return finalizeValidation(
        validatePreGraphGenerationWithSchema<PacktoryConfigWithoutRegistry>(packtoryConfigWithoutRegistrySchema, config)
    );
}
