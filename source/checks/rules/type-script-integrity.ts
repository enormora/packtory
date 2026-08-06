import type { ResolutionKind } from '@arethetypeswrong/core';
import { z } from 'zod/mini';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import type { CheckRuleDefinition, RuleRunInput } from '../rule.ts';
import type { DeclarationIntegritySummarizer, DeclarationMode } from './type-script-declaration-integrity.ts';
import type { PackageResolutionAnalyzer } from './type-script-package-resolution.ts';
import { summarizeResolutionReport } from './type-script-resolution-summary.ts';

const ruleName = 'typeScriptIntegrity';
const checkedResolutionKinds: readonly ResolutionKind[] = [ 'node16-esm', 'bundler' ];
const declarationModeValues: readonly [DeclarationMode, ...DeclarationMode[]] = [ 'all', 'exports-graph' ];
const defaultDeclarationMode: DeclarationMode = 'all';

const globalSchema = z.strictObject({
    enabled: z.boolean(),
    declarations: z.optional(z.enum(declarationModeValues))
});

const perPackageSchema = z.strictObject({});

type GlobalConfig = Readonly<z.infer<typeof globalSchema>>;
type PerPackageConfig = Readonly<z.infer<typeof perPackageSchema>>;
type RunInput = RuleRunInput<typeof ruleName, GlobalConfig, PerPackageConfig>;
type CheckBundle = RunInput['bundles'][number];
type BinOnlyBundle = CheckBundle & {
    readonly surface: Extract<CheckBundle['surface'], { readonly mode: 'explicit'; }> & {
        readonly packageInterface: {
            readonly bins?: NonNullable<
                Extract<
                    CheckBundle['surface'],
                    { readonly mode: 'explicit'; }
                >['packageInterface']['bins']
            >;
            readonly modules?: undefined;
        };
    };
};
type PackageIntegrityInput = {
    readonly bundle: CheckBundle;
    readonly packageName: string;
    readonly publishedPackage: Readonly<PublishedPackageWithManifest>;
    readonly publishedPackages: ReadonlyMap<string, PublishedPackageWithManifest>;
    readonly declarationMode: DeclarationMode;
};

export type TypeScriptIntegrityRule = CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig>;

export const typeScriptIntegritySchemas: Pick<TypeScriptIntegrityRule, 'globalSchema' | 'perPackageSchema'> = {
    globalSchema,
    perPackageSchema
};

export type TypeScriptIntegrityDependencies = {
    readonly analyzePackageResolution: PackageResolutionAnalyzer;
    readonly summarizeDeclarationIntegrity: DeclarationIntegritySummarizer;
};

function isBinOnlyPackage(bundle: CheckBundle): bundle is BinOnlyBundle {
    return bundle.surface.mode === 'explicit' &&
        bundle.surface.packageInterface.modules === undefined;
}

function binOnlyPackageHasDeclarations(bundle: BinOnlyBundle): boolean {
    const binEntries = bundle.surface.packageInterface.bins;
    return binEntries?.some(function (entry) {
        return bundle.roots[entry.root]?.declarationFile !== undefined;
    }) === true;
}

export function createTypeScriptIntegrityRule(
    dependencies: TypeScriptIntegrityDependencies
): TypeScriptIntegrityRule {
    const { analyzePackageResolution, summarizeDeclarationIntegrity } = dependencies;

    async function summarizePackageResolution(
        packageName: string,
        publishedPackage: Readonly<PublishedPackageWithManifest>
    ): Promise<readonly string[]> {
        try {
            const report = await analyzePackageResolution(publishedPackage, checkedResolutionKinds);
            return summarizeResolutionReport(packageName, report, checkedResolutionKinds);
        } catch (error: unknown) {
            return [ `Package "${packageName}" failed TypeScript integrity: ${String(error)}` ];
        }
    }

    async function runForPackage(input: PackageIntegrityInput): Promise<readonly string[]> {
        const { bundle, packageName, publishedPackage, publishedPackages, declarationMode } = input;
        if (isBinOnlyPackage(bundle)) {
            return binOnlyPackageHasDeclarations(bundle)
                ? summarizeDeclarationIntegrity(packageName, publishedPackage, declarationMode, publishedPackages)
                : [];
        }

        return [
            ...await summarizePackageResolution(packageName, publishedPackage),
            ...summarizeDeclarationIntegrity(packageName, publishedPackage, declarationMode, publishedPackages)
        ];
    }

    async function run(input: RunInput): Promise<readonly string[]> {
        const globalConfig = input.settings?.typeScriptIntegrity;
        if (globalConfig?.enabled !== true) {
            return [];
        }

        const declarationMode = globalConfig.declarations ?? defaultDeclarationMode;
        const { publishedPackages } = input;
        if (publishedPackages === undefined) {
            throw new Error('Published packages missing for TypeScript integrity');
        }
        const issuesByBundle = await Promise.all(
            input.bundles.map(async function (bundle) {
                const publishedPackage = publishedPackages.get(bundle.name);
                if (publishedPackage === undefined) {
                    throw new Error(`Published package missing for "${bundle.name}"`);
                }

                return await runForPackage({
                    bundle,
                    packageName: bundle.name,
                    publishedPackage,
                    publishedPackages,
                    declarationMode
                });
            })
        );
        return issuesByBundle.flat();
    }

    return {
        name: ruleName,
        ...typeScriptIntegritySchemas,
        run
    };
}
