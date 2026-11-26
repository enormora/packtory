import type { z } from 'zod/mini';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    pathAllowListGlobalSchema,
    pathAllowListPerPackageSchema,
    type CheckRuleDefinition,
    type RuleRunInput
} from '../rule.ts';

const ruleName = 'noSideEffects';

const globalSchema = pathAllowListGlobalSchema;
const perPackageSchema = pathAllowListPerPackageSchema;

type GlobalConfiguration = Readonly<z.infer<typeof globalSchema>>;
type PerPackageConfiguration = Readonly<z.infer<typeof perPackageSchema>>;
type NoSideEffectsRunInput = RuleRunInput<typeof ruleName, GlobalConfiguration, PerPackageConfiguration>;

type SideEffectStatement = {
    readonly line: number;
    readonly kind: string;
};

function formatStatement(statement: SideEffectStatement): string {
    return `line ${statement.line}: ${statement.kind}`;
}

function isAllowedFor(
    inputFilePath: string,
    bundleName: string,
    globalAllowList: ReadonlySet<string>,
    perPackageSettings: NoSideEffectsRunInput['perPackageSettings']
): boolean {
    if (globalAllowList.has(inputFilePath)) {
        return true;
    }
    const packageAllowList = perPackageSettings.get(bundleName)?.noSideEffects?.allowList;
    return packageAllowList?.includes(inputFilePath) ?? false;
}

function reportResource(bundleName: string, resource: AnalyzedBundleResource): string {
    const sourcePath = resource.fileDescription.inputFilePath;
    const lines = resource.analysis.sideEffectStatements.map(function (statement) {
        return `  - ${formatStatement(statement)}`;
    });
    const header = `File "${sourcePath}" in package "${bundleName}" has top-level side effects:`;
    const footer = 'Side effects prevent downstream tree-shaking.';
    return [ header, ...lines, footer ].join('\n');
}

function hasSideEffects(resource: AnalyzedBundleResource): boolean {
    return resource.analysis.sideEffectStatements.length > 0;
}

function findSideEffectsInBundle(
    bundle: AnalyzedBundle,
    globalAllowList: ReadonlySet<string>,
    perPackageSettings: NoSideEffectsRunInput['perPackageSettings']
): readonly string[] {
    return bundle.contents.flatMap(function (resource) {
        if (
            !hasSideEffects(resource) ||
            isAllowedFor(resource.fileDescription.inputFilePath, bundle.name, globalAllowList, perPackageSettings)
        ) {
            return [];
        }
        return reportResource(bundle.name, resource);
    });
}

function sideEffectingFilePaths(bundles: readonly AnalyzedBundle[]): ReadonlySet<string> {
    return new Set(
        bundles.flatMap(function (bundle) {
            return bundle.contents.filter(hasSideEffects).map(function (resource) {
                return resource.fileDescription.inputFilePath;
            });
        })
    );
}

function reportUnusedEntries(
    allowList: readonly string[],
    sideEffectingPaths: ReadonlySet<string>,
    allowListName: string
): readonly string[] {
    return allowList
        .filter(function isUnused(entry) {
            return !sideEffectingPaths.has(entry);
        })
        .map(function (entry) {
            return `${allowListName} lists "${entry}", but no such file has top-level side effects; remove it.`;
        });
}

function findUnusedPackageEntries(
    bundle: AnalyzedBundle,
    perPackageSettings: NoSideEffectsRunInput['perPackageSettings']
): readonly string[] {
    const packageAllowList = perPackageSettings.get(bundle.name)?.noSideEffects?.allowList ?? [];
    return reportUnusedEntries(
        packageAllowList,
        sideEffectingFilePaths([ bundle ]),
        `The noSideEffects allowList of package "${bundle.name}"`
    );
}

async function run(input: NoSideEffectsRunInput): Promise<readonly string[]> {
    const globalConfiguration = input.settings?.noSideEffects;
    if (globalConfiguration?.enabled !== true) {
        return [];
    }
    const globalAllowList = globalConfiguration.allowList ?? [];
    const globalAllowListSet = new Set(globalAllowList);
    const sideEffectIssues = input.bundles.flatMap(function (bundle) {
        return findSideEffectsInBundle(bundle, globalAllowListSet, input.perPackageSettings);
    });
    const unusedPackageEntryIssues = input.bundles.flatMap(function (bundle) {
        return findUnusedPackageEntries(bundle, input.perPackageSettings);
    });
    return [
        ...sideEffectIssues,
        ...reportUnusedEntries(globalAllowList, sideEffectingFilePaths(input.bundles), 'The noSideEffects allowList'),
        ...unusedPackageEntryIssues
    ];
}

export const noSideEffectsRule: CheckRuleDefinition<typeof ruleName, GlobalConfiguration, PerPackageConfiguration> = {
    name: ruleName,
    globalSchema,
    perPackageSchema,
    run
};
