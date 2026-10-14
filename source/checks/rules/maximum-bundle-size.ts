import { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { CheckRuleDefinition, RuleRunInput } from '../rule.ts';

function ruleName(): 'maximumBundleSize' {
    return 'maximumBundleSize';
}

const byteLimitSchema = z.number().check(z.int(), z.nonnegative());

type RuleName = ReturnType<typeof ruleName>;
type GlobalConfiguration = { readonly enabled: boolean; readonly bytes?: number | undefined; };
type PerPackageConfiguration = { readonly bytes?: number | undefined; };

function globalSchema(): z.ZodMiniType<GlobalConfiguration> {
    return z.strictObject({
        enabled: z.boolean(),
        bytes: z.optional(byteLimitSchema)
    });
}

function perPackageSchema(): z.ZodMiniType<PerPackageConfiguration> {
    return z.strictObject({
        bytes: z.optional(byteLimitSchema)
    });
}

type RunInput = RuleRunInput<RuleName, GlobalConfiguration, PerPackageConfiguration>;

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
    return [ `Package "${bundle.name}" exceeds the maximum bundle size: ${size} bytes (limit: ${threshold} bytes)` ];
}

async function run(input: RunInput): Promise<readonly string[]> {
    const globalConfiguration = input.settings?.maximumBundleSize;
    if (globalConfiguration?.enabled !== true) {
        return [];
    }

    return input.bundles.flatMap(function (bundle) {
        const override = input.perPackageSettings.get(bundle.name)?.maximumBundleSize?.bytes;
        return checkBundle(bundle, override ?? globalConfiguration.bytes);
    });
}

export const maximumBundleSizeRule: CheckRuleDefinition<RuleName, GlobalConfiguration, PerPackageConfiguration> = {
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
