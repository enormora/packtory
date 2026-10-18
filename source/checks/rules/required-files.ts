import { unique } from 'remeda';
import { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { nonEmptyStringSchema } from '../../configuration/base-validations.ts';
import type { CheckRuleDefinition, RuleRunInput } from '../rule.ts';

const ruleName = 'requiredFiles';

const fileListSchema = z.readonly(z.array(nonEmptyStringSchema));

const globalSchema = z.strictObject({
    enabled: z.boolean(),
    files: z.optional(fileListSchema)
});

const perPackageSchema = z.strictObject({
    files: z.optional(fileListSchema)
});

type GlobalConfiguration = Readonly<z.infer<typeof globalSchema>>;
type PerPackageConfiguration = Readonly<z.infer<typeof perPackageSchema>>;
type RunInput = RuleRunInput<typeof ruleName, GlobalConfiguration, PerPackageConfiguration>;

function effectiveRequiredFiles(
    globalConfiguration: GlobalConfiguration,
    perPackageConfiguration: PerPackageConfiguration | undefined
): readonly string[] {
    return unique([ ...globalConfiguration.files ?? [], ...perPackageConfiguration?.files ?? [] ]);
}

function findMissingFiles(bundle: AnalyzedBundle, requiredFiles: readonly string[]): readonly string[] {
    const presentTargets = new Set(
        bundle.contents.map(function (resource) {
            return resource.fileDescription.targetFilePath;
        })
    );
    return requiredFiles.filter(function (file) {
        return !presentTargets.has(file);
    });
}

async function run(input: RunInput): Promise<readonly string[]> {
    const globalConfiguration = input.settings?.requiredFiles;
    if (globalConfiguration?.enabled !== true) {
        return [];
    }

    return input.bundles.flatMap(function (bundle) {
        const requiredFiles = effectiveRequiredFiles(
            globalConfiguration,
            input.perPackageSettings.get(bundle.name)?.requiredFiles
        );
        return findMissingFiles(bundle, requiredFiles).map(function (file) {
            return `Package "${bundle.name}" is missing required file "${file}"`;
        });
    });
}

export const requiredFilesRule: CheckRuleDefinition<typeof ruleName, GlobalConfiguration, PerPackageConfiguration> = {
    name: ruleName,
    globalSchema,
    perPackageSchema,
    run
};
