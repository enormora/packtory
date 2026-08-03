import { unique } from 'remeda';
import { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { nonEmptyStringSchema } from '../../config/base-validations.ts';
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

type GlobalConfig = Readonly<z.infer<typeof globalSchema>>;
type PerPackageConfig = Readonly<z.infer<typeof perPackageSchema>>;
type RunInput = RuleRunInput<typeof ruleName, GlobalConfig, PerPackageConfig>;

function effectiveRequiredFiles(
    globalConfig: GlobalConfig,
    perPackageConfig: PerPackageConfig | undefined
): readonly string[] {
    return unique([ ...globalConfig.files ?? [], ...perPackageConfig?.files ?? [] ]);
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
    const globalConfig = input.settings?.requiredFiles;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    return input.bundles.flatMap(function (bundle) {
        const requiredFiles = effectiveRequiredFiles(
            globalConfig,
            input.perPackageSettings.get(bundle.name)?.requiredFiles
        );
        return findMissingFiles(bundle, requiredFiles).map(function (file) {
            return `Package "${bundle.name}" is missing required file "${file}"`;
        });
    });
}

export const requiredFilesRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema,
    perPackageSchema,
    run
};
