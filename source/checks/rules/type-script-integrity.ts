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

type GlobalConfiguration = Readonly<z.infer<typeof globalSchema>>;
type PerPackageConfiguration = Readonly<z.infer<typeof perPackageSchema>>;
type RunInput = RuleRunInput<typeof ruleName, GlobalConfiguration, PerPackageConfiguration>;
type CheckBundle = RunInput['bundles'][number];
type ExplicitBundle = CheckBundle & {
    readonly surface: Extract<CheckBundle['surface'], { readonly mode: 'explicit'; }>;
};

export type TypeScriptIntegrityRule = CheckRuleDefinition<
    typeof ruleName,
    GlobalConfiguration,
    PerPackageConfiguration
>;

export const typeScriptIntegritySchemas: Pick<TypeScriptIntegrityRule, 'globalSchema' | 'perPackageSchema'> = {
    globalSchema,
    perPackageSchema
};

export type TypeScriptIntegrityDependencies = {
    readonly analyzePackageResolution: PackageResolutionAnalyzer;
    readonly summarizeDeclarationIntegrity: (
        ...arguments_: Parameters<DeclarationIntegritySummarizer>
    ) => Promise<readonly string[]> | readonly string[];
};

function isExecutableOnlyPackage(bundle: CheckBundle): bundle is ExplicitBundle {
    return bundle.surface.mode === 'explicit' &&
        bundle.surface.packageInterface.modules === undefined;
}

function hasExecutableDeclarations(bundle: ExplicitBundle): boolean {
    return bundle.surface.packageInterface.executables?.some(function (entry) {
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

    async function runForPackage(
        bundle: CheckBundle,
        publishedPackage: Readonly<PublishedPackageWithManifest>,
        publishedPackages: ReadonlyMap<string, PublishedPackageWithManifest>,
        declarationMode: DeclarationMode
    ): Promise<readonly string[]> {
        const { name } = bundle;
        const hasJavaScript = Object.values(bundle.roots).some(function (root) {
            return root.javaScript !== undefined;
        });
        if (!hasJavaScript) {
            const hasDeclarations = Object.values(bundle.roots).some(function (root) {
                return root.declarationFile !== undefined;
            });
            if (hasDeclarations) {
                return summarizeDeclarationIntegrity(name, publishedPackage, declarationMode, publishedPackages);
            }
            return [];
        }
        if (isExecutableOnlyPackage(bundle)) {
            return hasExecutableDeclarations(bundle)
                ? summarizeDeclarationIntegrity(name, publishedPackage, declarationMode, publishedPackages)
                : [];
        }

        return [
            ...await summarizePackageResolution(name, publishedPackage),
            ...await summarizeDeclarationIntegrity(name, publishedPackage, declarationMode, publishedPackages)
        ];
    }

    async function runConfiguredBundle(
        bundle: CheckBundle,
        publishedPackages: ReadonlyMap<string, PublishedPackageWithManifest>,
        declarationMode: DeclarationMode
    ): Promise<readonly string[]> {
        const publishedPackage = publishedPackages.get(bundle.name);
        if (publishedPackage === undefined) {
            throw new Error(`Published package missing for "${bundle.name}"`);
        }
        return runForPackage(bundle, publishedPackage, publishedPackages, declarationMode);
    }

    function publishedPackagesFor(input: RunInput): ReadonlyMap<string, PublishedPackageWithManifest> {
        if (input.publishedPackages === undefined) {
            throw new Error('Published packages missing for TypeScript integrity');
        }
        return input.publishedPackages;
    }

    async function run(input: RunInput): Promise<readonly string[]> {
        const globalConfiguration = input.settings?.typeScriptIntegrity;
        if (globalConfiguration?.enabled !== true) {
            return [];
        }

        const publishedPackages = publishedPackagesFor(input);
        const issues: string[] = [];
        for (const bundle of input.bundles) {
            issues.push(
                ...await runConfiguredBundle(
                    bundle,
                    publishedPackages,
                    globalConfiguration.declarations ?? defaultDeclarationMode
                )
            );
        }
        return issues;
    }

    return {
        name: ruleName,
        ...typeScriptIntegritySchemas,
        run
    };
}
