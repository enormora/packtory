import { Result } from 'true-myth';
import type { ZodMiniType } from 'zod/mini';
import { safeParse } from '../common/schema-validation.ts';
import type { DirectedGraph } from '../directed-graph/graph.ts';
import type {
    PackageConfiguration,
    PackageConfigurationsByName,
    PacktoryConfiguration,
    PacktoryConfigurationWithoutRegistry
} from './configuration.ts';
import { validateCyclicDependencies, validateDuplicatePackages } from './cross-package-validation.ts';
import { buildPackageGraph } from './package-graph-builder.ts';
import { packtoryConfigurationSchema } from './packtory-configuration-schema.ts';
import { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';
import { collectPreGraphIssues, packageListToRecord } from './pre-graph-validation.ts';

type PackagedConfiguration = {
    readonly packages: readonly PackageConfiguration[];
};

type GraphGenerationPossibleResult<TConfiguration extends PackagedConfiguration> = {
    readonly packtoryConfiguration: TConfiguration;
    readonly packageConfigurations: PackageConfigurationsByName;
};

type ConfigurationWithGraphInternal<TConfiguration extends PackagedConfiguration> = {
    readonly packtoryConfiguration: TConfiguration;
    readonly packageConfigurations: PackageConfigurationsByName;
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

function normalizeConfigurationAliases(configuration: unknown): unknown {
    const configurationRecord: Readonly<Record<string, unknown>> = Object.fromEntries(
        Object.entries(new Object(configuration))
    );

    return {
        ...configurationRecord,
        commonPackageSettings: normalizeAdditionalFileAliases(configurationRecord.commonPackageSettings),
        packages: Array.isArray(configurationRecord.packages)
            ? configurationRecord.packages.map(normalizeAdditionalFileAliases)
            : configurationRecord.packages
    };
}

function validatePreGraphGenerationWithSchema<TConfiguration extends PacktoryConfigurationWithoutRegistry>(
    schema: ZodMiniType,
    configuration: unknown
): Result<GraphGenerationPossibleResult<TConfiguration>, readonly string[]> {
    const schemaValidationResult = safeParse(schema, normalizeConfigurationAliases(configuration));
    if (!schemaValidationResult.success) {
        return Result.err(schemaValidationResult.error.issues);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- inferred schema output is narrower than the exported config type and validated before use
    const packtoryConfiguration = schemaValidationResult.data as TConfiguration;
    const packageConfigurations = packageListToRecord(packtoryConfiguration.packages);

    const preGraphIssues = collectPreGraphIssues(packtoryConfiguration);
    if (preGraphIssues.length > 0) {
        return Result.err([ ...validateDuplicatePackages(packtoryConfiguration.packages), ...preGraphIssues ]);
    }

    return Result.ok({ packtoryConfiguration, packageConfigurations });
}

function finalizeValidation<TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }>(
    result: Result<GraphGenerationPossibleResult<TConfiguration>, readonly string[]>
): Result<ConfigurationWithGraphInternal<TConfiguration>, readonly string[]> {
    if (result.isErr) {
        return Result.err(result.error);
    }

    const { packageConfigurations, packtoryConfiguration } = result.value;
    const packageGraph = buildPackageGraph(packageConfigurations);

    const issues = [
        ...validateDuplicatePackages(packtoryConfiguration.packages),
        ...validateCyclicDependencies(packageGraph)
    ];
    if (issues.length > 0) {
        return Result.err(issues);
    }

    return Result.ok({ packtoryConfiguration, packageConfigurations, packageGraph });
}

export type ConfigurationWithGraph<TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }> =
    ConfigurationWithGraphInternal<
        TConfiguration
    >;
export type ValidConfigurationResult = ConfigurationWithGraph<PacktoryConfiguration>;
export type ValidConfigurationWithoutRegistryResult = ConfigurationWithGraph<PacktoryConfigurationWithoutRegistry>;

export function validateConfiguration(configuration: unknown): Result<ValidConfigurationResult, readonly string[]> {
    return finalizeValidation(
        validatePreGraphGenerationWithSchema<PacktoryConfiguration>(packtoryConfigurationSchema, configuration)
    );
}

export function validateConfigurationWithoutRegistry(
    configuration: unknown
): Result<ValidConfigurationWithoutRegistryResult, readonly string[]> {
    return finalizeValidation(
        validatePreGraphGenerationWithSchema<PacktoryConfigurationWithoutRegistry>(
            packtoryConfigurationWithoutRegistrySchema,
            configuration
        )
    );
}
