import type { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    type CheckRuleDefinition,
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type RulePackageConfiguration,
    type RuleRunInput
} from '../rule.ts';

function ruleName(): 'noDevelopmentDependencyImports' {
    return 'noDevelopmentDependencyImports';
}

function globalSchema(): typeof enabledOnlyGlobalSchema {
    return enabledOnlyGlobalSchema;
}

function perPackageSchema(): typeof emptyPerPackageSchema {
    return emptyPerPackageSchema;
}

type RuleName = ReturnType<typeof ruleName>;
type GlobalConfiguration = Readonly<z.infer<ReturnType<typeof globalSchema>>>;
type PerPackageConfiguration = Readonly<z.infer<ReturnType<typeof perPackageSchema>>>;
type RunInput = RuleRunInput<RuleName, GlobalConfiguration, PerPackageConfiguration>;

function findLeakedDevelopmentDependencies(
    bundle: AnalyzedBundle,
    packageConfiguration: RulePackageConfiguration | undefined
): readonly string[] {
    const mainPackageManifest = packageConfiguration?.mainPackageManifest;
    if (mainPackageManifest === undefined) {
        return [];
    }
    const runtimeDependencyNames = new Set([
        ...Object.keys(mainPackageManifest.dependencies ?? {}),
        ...Object.keys(mainPackageManifest.peerDependencies ?? {})
    ]);
    const developmentDependencyNames = new Set(Object.keys(mainPackageManifest.devDependencies ?? {}));

    return Array
        .from(bundle.externalDependencies.keys())
        .filter(function (name) {
            return developmentDependencyNames.has(name) && !runtimeDependencyNames.has(name);
        })
        .map(function (name) {
            const reason = 'is only declared in devDependencies of the main package.json';
            return `Package "${bundle.name}" imports "${name}" which ${reason}`;
        });
}

async function run(input: RunInput): Promise<readonly string[]> {
    const globalConfiguration = input.settings?.noDevelopmentDependencyImports;
    if (globalConfiguration?.enabled !== true) {
        return [];
    }

    return input.bundles.flatMap(function (bundle) {
        return findLeakedDevelopmentDependencies(bundle, input.packageConfigurations?.[bundle.name]);
    });
}

export const noDevelopmentDependencyImportsRule: CheckRuleDefinition<
    RuleName,
    GlobalConfiguration,
    PerPackageConfiguration
> = {
    get name() {
        return ruleName();
    },
    get globalSchema() {
        return globalSchema();
    },
    get perPackageSchema() {
        return perPackageSchema();
    },
    run
};
