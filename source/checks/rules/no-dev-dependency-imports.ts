import type { z } from 'zod/mini';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type CheckRuleDefinition,
    type RulePackageConfig,
    type RuleRunParams
} from '../rule.ts';

const ruleName = 'noDevDependencyImports';

type GlobalConfig = z.infer<typeof enabledOnlyGlobalSchema>;
type PerPackageConfig = z.infer<typeof emptyPerPackageSchema>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;

function findLeakedDevDependencies(
    bundle: LinkedBundle,
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

    return Array.from(bundle.externalDependencies.keys())
        .filter((name) => {
            return devDependencyNames.has(name) && !runtimeDependencyNames.has(name);
        })
        .map((name) => {
            const reason = 'is only declared in devDependencies of the main package.json';
            return `Package "${bundle.name}" imports "${name}" which ${reason}`;
        });
}

function run(params: RunParams): readonly string[] {
    const globalConfig = params.settings?.noDevDependencyImports;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    return params.bundles.flatMap((bundle) => {
        return findLeakedDevDependencies(bundle, params.packageConfigs?.[bundle.name]);
    });
}

export const noDevDependencyImportsRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema: enabledOnlyGlobalSchema,
    perPackageSchema: emptyPerPackageSchema,
    run
};
