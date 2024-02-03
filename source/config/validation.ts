import { Result } from 'true-myth';
import { validateAgainstSchema } from '../validation/validate.js';
import { type DirectedGraph, createDirectedGraph } from '../directed-graph/graph.js';
import { type PacktoryConfig, packtoryConfigSchema, type PackageConfig } from './config.js';

function buildPackageGraph(packages: ReadonlyMap<string, PackageConfig>): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    for (const packageConfig of packages.values()) {
        graph.addNode(packageConfig.name, undefined);
    }

    for (const packageConfig of packages.values()) {
        const allDependencies = [
            ...(packageConfig.bundleDependencies ?? []),
            ...(packageConfig.bundlePeerDependencies ?? [])
        ];

        for (const dependency of allDependencies) {
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
    // use Map.groupBy once https://github.com/microsoft/TypeScript/pull/56805 has landed
    return packages.reduce((map, packageConfig) => {
        map.set(packageConfig.name, packageConfig);
        return map;
    }, new Map<string, PackageConfig>());
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

type GraphGenerationPossibleResult = {
    readonly packtoryConfig: PacktoryConfig;
    readonly packageConfigs: Map<string, PackageConfig>;
};

function validatePreGraphGeneration(config: unknown): Result<GraphGenerationPossibleResult, readonly string[]> {
    const schemaValidationResult = validateAgainstSchema(packtoryConfigSchema, config);

    if (schemaValidationResult.isErr) {
        return Result.err(schemaValidationResult.error.issues);
    }

    const packtoryConfig = schemaValidationResult.value;
    const packageConfigs = packageListToMap(packtoryConfig.packages);

    const missingDependenciesIssues = validateDependenciesExist(packageConfigs);
    if (missingDependenciesIssues.length > 0) {
        const issues = Array.from(validateDuplicatePackages(packtoryConfig.packages));
        return Result.err([...issues, ...missingDependenciesIssues]);
    }

    return Result.ok({
        packtoryConfig,
        packageConfigs
    });
}

export type ValidConfigResult = GraphGenerationPossibleResult & {
    readonly packageGraph: DirectedGraph<string, undefined>;
};

export function validateConfig(config: unknown): Result<ValidConfigResult, readonly string[]> {
    const result = validatePreGraphGeneration(config);

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
