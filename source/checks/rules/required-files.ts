import { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { nonEmptyStringSchema } from '../../config/base-validations.ts';
import type { CheckRuleDefinition, RuleRunParams } from '../rule.ts';

const ruleName = 'requiredFiles';

const fileListSchema = z.readonly(z.array(nonEmptyStringSchema));

const globalSchema = z.strictObject({
    enabled: z.boolean(),
    files: z.optional(fileListSchema)
});

const perPackageSchema = z.strictObject({
    files: z.optional(fileListSchema)
});

type GlobalConfig = z.infer<typeof globalSchema>;
type PerPackageConfig = z.infer<typeof perPackageSchema>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;

function effectiveRequiredFiles(
    globalConfig: GlobalConfig,
    perPackageConfig: PerPackageConfig | undefined
): readonly string[] {
    return Array.from(new Set([...(globalConfig.files ?? []), ...(perPackageConfig?.files ?? [])]));
}

function findMissingFiles(bundle: AnalyzedBundle, requiredFiles: readonly string[]): readonly string[] {
    const presentTargets = new Set(
        bundle.contents.map((resource) => {
            return resource.fileDescription.targetFilePath;
        })
    );
    return requiredFiles.filter((file) => {
        return !presentTargets.has(file);
    });
}

function run(params: RunParams): readonly string[] {
    const globalConfig = params.settings?.requiredFiles;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    return params.bundles.flatMap((bundle) => {
        const requiredFiles = effectiveRequiredFiles(
            globalConfig,
            params.perPackageSettings.get(bundle.name)?.requiredFiles
        );
        return findMissingFiles(bundle, requiredFiles).map((file) => {
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
