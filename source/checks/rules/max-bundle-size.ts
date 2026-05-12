import { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { CheckRuleDefinition, RuleRunParams } from '../rule.ts';

const ruleName = 'maxBundleSize';

const byteLimitSchema = z.number().check(z.int(), z.nonnegative());

const globalSchema = z.strictObject({
    enabled: z.boolean(),
    bytes: z.optional(byteLimitSchema)
});

const perPackageSchema = z.strictObject({
    bytes: z.optional(byteLimitSchema)
});

type GlobalConfig = z.infer<typeof globalSchema>;
type PerPackageConfig = z.infer<typeof perPackageSchema>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;

function bundleSizeBytes(bundle: AnalyzedBundle): number {
    let total = 0;
    for (const resource of bundle.contents) {
        total += Buffer.byteLength(resource.fileDescription.content);
    }
    return total;
}

function checkBundle(bundle: AnalyzedBundle, threshold: number | undefined): readonly string[] {
    if (threshold === undefined) {
        return [];
    }
    const size = bundleSizeBytes(bundle);
    if (size <= threshold) {
        return [];
    }
    return [`Package "${bundle.name}" exceeds the maximum bundle size: ${size} bytes (limit: ${threshold} bytes)`];
}

function run(params: RunParams): readonly string[] {
    const globalConfig = params.settings?.maxBundleSize;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    return params.bundles.flatMap((bundle) => {
        const override = params.perPackageSettings.get(bundle.name)?.maxBundleSize?.bytes;
        return checkBundle(bundle, override ?? globalConfig.bytes);
    });
}

export const maxBundleSizeRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema,
    perPackageSchema,
    run
};
