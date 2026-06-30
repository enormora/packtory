import type { z } from 'zod/mini';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    pathAllowListGlobalSchema,
    pathAllowListPerPackageSchema,
    type CheckRuleDefinition,
    type RuleRunParams
} from '../rule.ts';

const ruleName = 'noSideEffects';

const globalSchema = pathAllowListGlobalSchema;
const perPackageSchema = pathAllowListPerPackageSchema;

type GlobalConfig = Readonly<z.infer<typeof globalSchema>>;
type PerPackageConfig = Readonly<z.infer<typeof perPackageSchema>>;
type NoSideEffectsRunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;

type SideEffectStatement = {
    readonly line: number;
    readonly kind: string;
};

function formatStatement(statement: SideEffectStatement): string {
    return `line ${statement.line}: ${statement.kind}`;
}

function isAllowedFor(
    sourceFilePath: string,
    bundleName: string,
    globalAllowList: ReadonlySet<string>,
    perPackageSettings: NoSideEffectsRunParams['perPackageSettings']
): boolean {
    if (globalAllowList.has(sourceFilePath)) {
        return true;
    }
    const packageAllowList = perPackageSettings.get(bundleName)?.noSideEffects?.allowList;
    return packageAllowList?.includes(sourceFilePath) ?? false;
}

function reportResource(bundleName: string, resource: AnalyzedBundleResource): string {
    const sourcePath = resource.fileDescription.sourceFilePath;
    const lines = resource.analysis.sideEffectStatements.map(function (statement) {
        return `  - ${formatStatement(statement)}`;
    });
    const header = `File "${sourcePath}" in package "${bundleName}" has top-level side effects:`;
    const footer = 'Side effects prevent downstream tree-shaking.';
    return [ header, ...lines, footer ].join('\n');
}

function findSideEffectsInBundle(
    bundle: AnalyzedBundle,
    globalAllowList: ReadonlySet<string>,
    perPackageSettings: NoSideEffectsRunParams['perPackageSettings']
): readonly string[] {
    return bundle.contents.flatMap(function (resource) {
        if (resource.analysis.sideEffectStatements.length === 0) {
            return [];
        }
        if (isAllowedFor(resource.fileDescription.sourceFilePath, bundle.name, globalAllowList, perPackageSettings)) {
            return [];
        }
        return [ reportResource(bundle.name, resource) ];
    });
}

async function run(params: NoSideEffectsRunParams): Promise<readonly string[]> {
    const globalConfig = params.settings?.noSideEffects;
    if (globalConfig?.enabled !== true) {
        return [];
    }
    const globalAllowList = new Set(globalConfig.allowList);
    return params.bundles.flatMap(function (bundle) {
        return findSideEffectsInBundle(bundle, globalAllowList, params.perPackageSettings);
    });
}

export const noSideEffectsRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema,
    perPackageSchema,
    run
};
