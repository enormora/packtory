import type { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    defineCheckRule,
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type RulePackageConfig,
    type RuleRunParams
} from '../rule.ts';

function ruleName(): 'noDevDependencyImports' {
    return 'noDevDependencyImports';
}

function globalSchema(): typeof enabledOnlyGlobalSchema {
    return enabledOnlyGlobalSchema;
}

function perPackageSchema(): typeof emptyPerPackageSchema {
    return emptyPerPackageSchema;
}

type RuleName = ReturnType<typeof ruleName>;
type GlobalConfig = Readonly<z.infer<ReturnType<typeof globalSchema>>>;
type PerPackageConfig = Readonly<z.infer<ReturnType<typeof perPackageSchema>>>;
type RunParams = RuleRunParams<RuleName, GlobalConfig, PerPackageConfig>;

function findLeakedDevDependencies(
    bundle: AnalyzedBundle,
    packageConfig: RulePackageConfig | undefined
): readonly string[] {
    const mainPackageJson = packageConfig?.mainPackageJson;
    if (mainPackageJson === undefined) {
        return [];
    }
    const runtimeDependencyNames = new Set([
        ...Object.keys(mainPackageJson.dependencies ?? {}),
        ...Object.keys(mainPackageJson.peerDependencies ?? {})
    ]);
    const devDependencyNames = new Set(Object.keys(mainPackageJson.devDependencies ?? {}));

    return Array
        .from(bundle.externalDependencies.keys())
        .filter(function (name) {
            return devDependencyNames.has(name) && !runtimeDependencyNames.has(name);
        })
        .map(function (name) {
            const reason = 'is only declared in devDependencies of the main package.json';
            return `Package "${bundle.name}" imports "${name}" which ${reason}`;
        });
}

async function run(params: RunParams): Promise<readonly string[]> {
    const globalConfig = params.settings?.noDevDependencyImports;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    return params.bundles.flatMap(function (bundle) {
        return findLeakedDevDependencies(bundle, params.packageConfigs?.[bundle.name]);
    });
}

export const noDevDependencyImportsRule = defineCheckRule(ruleName, globalSchema, perPackageSchema, run);
