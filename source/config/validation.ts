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

type PackagedConfig = {
    readonly packages: readonly PackageConfig[];
};

type GraphGenerationPossibleResult<TConfig extends PackagedConfig> = {
    readonly packtoryConfig: TConfig;
    readonly packageConfigs: PackageConfigsByName;
};

type ConfigWithGraphInternal<TConfig extends PackagedConfig> = {
    readonly packtoryConfig: TConfig;
    readonly packageConfigs: PackageConfigsByName;
    readonly packageGraph: DirectedGraph<string, undefined>;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAdditionalFileDescriptionAliases(value: unknown): unknown {
    if (
        !isRecord(value) ||
        !Object.hasOwn(value, 'sourceFilePath') ||
        Object.hasOwn(value, 'inputFilePath')
    ) {
        return value;
    }

    const { sourceFilePath, ...canonical } = value;
    return {
        ...canonical,
        inputFilePath: sourceFilePath
    };
}

function normalizeAdditionalFileAliases(settings: unknown): unknown {
    if (!isRecord(settings) || !Array.isArray(settings.additionalFiles)) {
        return settings;
    }

    return {
        ...settings,
        additionalFiles: settings.additionalFiles.map(normalizeAdditionalFileDescriptionAliases)
    };
}

function normalizeConfigAliases(config: unknown): unknown {
    const configRecord: Readonly<Record<string, unknown>> = Object.fromEntries(Object.entries(new Object(config)));

    return {
        ...configRecord,
        commonPackageSettings: normalizeAdditionalFileAliases(configRecord.commonPackageSettings),
        packages: Array.isArray(configRecord.packages)
            ? configRecord.packages.map(normalizeAdditionalFileAliases)
            : configRecord.packages
    };
}

function validatePreGraphGenerationWithSchema<TConfig extends PacktoryConfigWithoutRegistry>(
    schema: ZodMiniType,
    config: unknown
): Result<GraphGenerationPossibleResult<TConfig>, readonly string[]> {
    const schemaValidationResult = safeParse(schema, normalizeConfigAliases(config));
    if (!schemaValidationResult.success) {
        return Result.err(schemaValidationResult.error.issues);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- changelog.prLog is pass-through at schema parse time and validated before use
    const packtoryConfig = schemaValidationResult.data as TConfig;
    const packageConfigs = packageListToRecord(packtoryConfig.packages);

    const preGraphIssues = collectPreGraphIssues(packtoryConfig);
    if (preGraphIssues.length > 0) {
        return Result.err([ ...validateDuplicatePackages(packtoryConfig.packages), ...preGraphIssues ]);
    }

    return Result.ok({ packtoryConfig, packageConfigs });
}

function finalizeValidation<TConfig extends { readonly packages: readonly PackageConfig[]; }>(
    result: Result<GraphGenerationPossibleResult<TConfig>, readonly string[]>
): Result<ConfigWithGraphInternal<TConfig>, readonly string[]> {
    if (result.isErr) {
        return Result.err(result.error);
    }

    const { packageConfigs, packtoryConfig } = result.value;
    const packageGraph = buildPackageGraph(packageConfigs);

    const issues = [
        ...validateDuplicatePackages(packtoryConfig.packages),
        ...validateCyclicDependencies(packageGraph)
    ];
    if (issues.length > 0) {
        return Result.err(issues);
    }

    return Result.ok({ packtoryConfig, packageConfigs, packageGraph });
}

export type ConfigWithGraph<TConfig extends { readonly packages: readonly PackageConfig[]; }> = ConfigWithGraphInternal<
    TConfig
>;
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
