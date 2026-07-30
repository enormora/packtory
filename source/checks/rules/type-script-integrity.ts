import {
    Package,
    checkPackage,
    type Analysis,
    type CheckResult,
    type Problem,
    type ProblemKind,
    type ResolutionKind
} from '@arethetypeswrong/core';
import {
    problemAffectsEntrypointResolution,
    problemAffectsResolutionKind,
    problemKindInfo
} from '@arethetypeswrong/core/problems';
import { z } from 'zod/mini';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import type { CheckRuleDefinition, RuleRunParams } from '../rule.ts';
import {
    summarizeDeclarationIntegrity,
    type DeclarationMode
} from './type-script-declaration-integrity.ts';

const ruleName = 'typeScriptIntegrity';
const checkedResolutionKinds = [ 'node16-esm', 'bundler' ] as const;
const declarationModeValues = [ 'all', 'exports-graph' ] as const;
const defaultDeclarationMode = 'all';
const packageFolder = '/node_modules';

const declarationModeSchema = z.enum(declarationModeValues);

const globalSchema = z.strictObject({
    enabled: z.boolean(),
    declarations: z.optional(declarationModeSchema)
});

const perPackageSchema = z.strictObject({});

type GlobalConfig = Readonly<z.infer<typeof globalSchema>>;
type PerPackageConfig = Readonly<z.infer<typeof perPackageSchema>>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;
type ProblemSummaryInput = {
    readonly packageName: string;
    readonly kind: ProblemKind;
    readonly problems: readonly Problem[];
    readonly analysis: Analysis;
    readonly requiredResolutionKinds: readonly ResolutionKind[];
};

function toPackageFilePath(packageName: string, filePath: string): string {
    return `${packageFolder}/${packageName}/${filePath}`;
}

function createInMemoryPackage(publishedPackage: Readonly<PublishedPackageWithManifest>): Package {
    const files: Record<string, Uint8Array | string> = {
        [toPackageFilePath(publishedPackage.name, publishedPackage.manifestFile.filePath)]:
            publishedPackage.manifestFile.content
    };

    for (const entry of publishedPackage.contents) {
        const filePath = toPackageFilePath(publishedPackage.name, entry.fileDescription.targetFilePath);
        files[filePath] = entry.fileDescription.content;
    }

    return new Package(files, publishedPackage.name, publishedPackage.version);
}

function groupProblemsByKind(problems: readonly Problem[]): ReadonlyMap<ProblemKind, readonly Problem[]> {
    const grouped = new Map<ProblemKind, Problem[]>();

    for (const problem of problems) {
        const existing = grouped.get(problem.kind);
        if (existing === undefined) {
            grouped.set(problem.kind, [ problem ]);
        } else {
            existing.push(problem);
        }
    }

    return grouped;
}

function listAffectedEntrypoints(
    problems: readonly Problem[],
    analysis: Analysis,
    requiredResolutionKinds: readonly ResolutionKind[]
): readonly string[] {
    const affectedEntrypoints = new Set<string>();

    for (const entrypoint of Object.keys(analysis.entrypoints)) {
        for (const problem of problems) {
            for (const resolutionKind of requiredResolutionKinds) {
                if (problemAffectsEntrypointResolution(problem, entrypoint, resolutionKind, analysis)) {
                    affectedEntrypoints.add(entrypoint);
                }
            }
        }
    }

    return Array.from(affectedEntrypoints);
}

function listAffectedResolutionKinds(
    problems: readonly Problem[],
    analysis: Analysis,
    requiredResolutionKinds: readonly ResolutionKind[]
): readonly ResolutionKind[] {
    const affectedResolutionKinds = new Set<ResolutionKind>();

    for (const resolutionKind of requiredResolutionKinds) {
        for (const problem of problems) {
            if (problemAffectsResolutionKind(problem, resolutionKind, analysis)) {
                affectedResolutionKinds.add(resolutionKind);
            }
        }
    }

    return requiredResolutionKinds.filter(function (resolutionKind) {
        return affectedResolutionKinds.has(resolutionKind);
    });
}

function formatQuotedList(prefix: string, values: readonly string[]): string {
    return values
        .map(function (value, index) {
            const separator = index === 0 ? ` ${prefix} ` : ', ';
            return `${separator}"${value}"`;
        })
        .join('');
}

function formatProblemSummary(input: ProblemSummaryInput): string {
    const { packageName, kind, problems, analysis, requiredResolutionKinds } = input;
    const problemInfo = problemKindInfo[kind];
    const entrypoints = listAffectedEntrypoints(problems, analysis, requiredResolutionKinds);
    const resolutionKinds = listAffectedResolutionKinds(problems, analysis, requiredResolutionKinds);
    const findings = problems.length === 1 ? '' : ` (${problems.length} findings)`;
    const entrypointList = formatQuotedList('affecting entrypoints', entrypoints);
    const resolutionList = formatQuotedList('in resolutions', resolutionKinds);
    return (
        `Package "${packageName}" failed TypeScript integrity: ` +
        `${problemInfo.shortDescription}${findings}${entrypointList}${resolutionList}`
    );
}

function summarizeProblems(
    packageName: string,
    analysis: Analysis,
    activeProblems: readonly Problem[],
    requiredResolutionKinds: readonly ResolutionKind[]
): readonly string[] {
    const summaries: string[] = Array.from(
        groupProblemsByKind(activeProblems),
        function ([ kind, problems ]) {
            return formatProblemSummary({ packageName, kind, problems, analysis, requiredResolutionKinds });
        }
    );

    return summaries;
}

function filterActiveProblems(
    analysis: Analysis,
    requiredResolutionKinds: readonly ResolutionKind[]
): readonly Problem[] {
    return analysis.problems.filter(function (problem) {
        return requiredResolutionKinds.some(function (resolutionKind) {
            return problemAffectsResolutionKind(problem, resolutionKind, analysis);
        });
    });
}

function summarizeAnalysis(packageName: string, analysis: Analysis): readonly string[] {
    const activeProblems = filterActiveProblems(analysis, checkedResolutionKinds);
    return summarizeProblems(packageName, analysis, activeProblems, checkedResolutionKinds);
}

function summarizeCheckResult(packageName: string, result: CheckResult): readonly string[] {
    if (result.types === false) {
        return [ `Package "${packageName}" does not expose TypeScript declarations` ];
    }
    return summarizeAnalysis(packageName, result);
}

async function summarizePackageResolution(
    packageName: string,
    publishedPackage: PublishedPackageWithManifest
): Promise<readonly string[]> {
    try {
        const result = await checkPackage(createInMemoryPackage(publishedPackage));
        return summarizeCheckResult(packageName, result);
    } catch (error) {
        return [ `Package "${packageName}" failed TypeScript integrity: ${String(error)}` ];
    }
}

async function runForPackage(
    packageName: string,
    publishedPackage: PublishedPackageWithManifest,
    declarationMode: DeclarationMode
): Promise<readonly string[]> {
    return [
        ...await summarizePackageResolution(packageName, publishedPackage),
        ...summarizeDeclarationIntegrity(packageName, publishedPackage, declarationMode)
    ];
}

async function run(params: RunParams): Promise<readonly string[]> {
    const globalConfig = params.settings?.typeScriptIntegrity;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    const declarationMode = globalConfig.declarations ?? defaultDeclarationMode;
    const issuesByBundle = await Promise.all(
        params.bundles.map(async function (bundle) {
            const publishedPackage = params.publishedPackages?.get(bundle.name);
            if (publishedPackage === undefined) {
                throw new Error(`Published package missing for "${bundle.name}"`);
            }

            return runForPackage(bundle.name, publishedPackage, declarationMode);
        })
    );
    return issuesByBundle.flat();
}

export const typeScriptIntegrityRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema,
    perPackageSchema,
    run
};
