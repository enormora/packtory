import type { z } from 'zod/mini';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    explicitBinTargetPaths,
    type PublishedPackageWithManifest
} from '../../published-package/published-package.ts';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type CheckRuleDefinition,
    type RuleRunInput
} from '../rule.ts';

const ruleName = 'noUnexposedExecutables';

type GlobalConfig = Readonly<z.infer<typeof enabledOnlyGlobalSchema>>;
type PerPackageConfig = Readonly<z.infer<typeof emptyPerPackageSchema>>;
type RunInput = RuleRunInput<typeof ruleName, GlobalConfig, PerPackageConfig>;

function reportExecutable(bundleName: string, resource: AnalyzedBundleResource): string {
    const { sourceFilePath, targetFilePath } = resource.fileDescription;
    return `Package "${bundleName}" ships executable file "${targetFilePath}" from "${sourceFilePath}" ` +
        'that is not exposed through bin';
}

function findUnexposedExecutables(
    bundle: AnalyzedBundle,
    publishedPackage: PublishedPackageWithManifest
): readonly string[] {
    const binTargets = explicitBinTargetPaths(publishedPackage);

    return bundle.contents.flatMap(function (resource) {
        if (!resource.fileDescription.isExecutable) {
            return [];
        }
        if (binTargets.has(resource.fileDescription.targetFilePath)) {
            return [];
        }
        return [ reportExecutable(bundle.name, resource) ];
    });
}

async function run(input: RunInput): Promise<readonly string[]> {
    const globalConfig = input.settings?.noUnexposedExecutables;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    const { publishedPackages } = input;
    if (publishedPackages === undefined) {
        throw new Error('Published packages missing for unexposed executable checks');
    }

    return input.bundles.flatMap(function (bundle) {
        const publishedPackage = publishedPackages.get(bundle.name);
        if (publishedPackage === undefined) {
            throw new Error(`Published package missing for "${bundle.name}"`);
        }
        return findUnexposedExecutables(bundle, publishedPackage);
    });
}

export const noUnexposedExecutablesRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema: enabledOnlyGlobalSchema,
    perPackageSchema: emptyPerPackageSchema,
    run
};
