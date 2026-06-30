import {
    Package,
    checkPackage,
    type Analysis,
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

const ruleName = 'areTheTypesWrong';
const defaultProfile = 'esm-only';
const profileValues = [ 'strict', 'node16', 'esm-only' ] as const;

const profileSchema = z.enum(profileValues);

const globalSchema = z.strictObject({
    enabled: z.boolean(),
    profile: z.optional(profileSchema)
});

const perPackageSchema = z.strictObject({
    profile: z.optional(profileSchema)
});

type AreTheTypesWrongProfile = z.infer<typeof profileSchema>;
type GlobalConfig = Readonly<z.infer<typeof globalSchema>>;
type PerPackageConfig = Readonly<z.infer<typeof perPackageSchema>>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;
type AreTheTypesWrongResult = Awaited<ReturnType<typeof checkPackage>>;
type CheckedPackageResult = { readonly result: AreTheTypesWrongResult; };
type FailedPackageResult = { readonly message: string; };
type PackageCheckResult = CheckedPackageResult | FailedPackageResult;
type ProblemSummaryInput = {
    readonly packageName: string;
    readonly kind: ProblemKind;
    readonly problems: readonly Problem[];
    readonly analysis: Analysis;
    readonly requiredResolutionKinds: readonly ResolutionKind[];
};

const requiredResolutionKindsByProfile: Readonly<Record<AreTheTypesWrongProfile, readonly ResolutionKind[]>> = {
    strict: [ 'node10', 'node16-cjs', 'node16-esm', 'bundler' ],
    node16: [ 'node16-cjs', 'node16-esm', 'bundler' ],
    'esm-only': [ 'node16-esm', 'bundler' ]
};

function resolveProfile(
    globalConfig: GlobalConfig,
    perPackageConfig: PerPackageConfig | undefined
): AreTheTypesWrongProfile {
    return perPackageConfig?.profile ?? globalConfig.profile ?? defaultProfile;
}

function toPackageFilePath(packageName: string, filePath: string): string {
    return `/node_modules/${packageName}/${filePath}`;
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
        `Package "${packageName}" failed the Are the Types Wrong check: ` +
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

function requiredResolutionKindsForProfile(profile: AreTheTypesWrongProfile): readonly ResolutionKind[] {
    return requiredResolutionKindsByProfile[profile];
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

function summarizeAnalysis(
    packageName: string,
    analysis: Analysis,
    profile: AreTheTypesWrongProfile
): readonly string[] {
    const requiredResolutionKinds = requiredResolutionKindsForProfile(profile);
    const activeProblems = filterActiveProblems(analysis, requiredResolutionKinds);
    return summarizeProblems(packageName, analysis, activeProblems, requiredResolutionKinds);
}

async function checkPublishedPackage(publishedPackage: PublishedPackageWithManifest): Promise<PackageCheckResult> {
    try {
        return { result: await checkPackage(createInMemoryPackage(publishedPackage)) };
    } catch (error) {
        return { message: String(error) };
    }
}

function isFailedPackageResult(checkResult: PackageCheckResult): checkResult is FailedPackageResult {
    return Object.hasOwn(checkResult, 'message');
}

function summarizePackageCheckResult(
    packageName: string,
    profile: AreTheTypesWrongProfile,
    checkResult: PackageCheckResult
): readonly string[] {
    if (isFailedPackageResult(checkResult)) {
        return [ `Package "${packageName}" failed the Are the Types Wrong check: ${checkResult.message}` ];
    }
    if (checkResult.result.types === false) {
        return [ `Package "${packageName}" does not expose TypeScript declarations` ];
    }
    return summarizeAnalysis(packageName, checkResult.result, profile);
}

async function runForPackage(
    packageName: string,
    publishedPackage: PublishedPackageWithManifest,
    profile: AreTheTypesWrongProfile
): Promise<readonly string[]> {
    return summarizePackageCheckResult(packageName, profile, await checkPublishedPackage(publishedPackage));
}

async function run(params: RunParams): Promise<readonly string[]> {
    const globalConfig = params.settings?.areTheTypesWrong;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    const issuesByBundle = await Promise.all(
        params.bundles.map(async function (bundle) {
            const publishedPackage = params.publishedPackages?.get(bundle.name);
            if (publishedPackage === undefined) {
                throw new Error(`Published package missing for "${bundle.name}"`);
            }

            const profile = resolveProfile(globalConfig, params.perPackageSettings.get(bundle.name)?.areTheTypesWrong);
            return runForPackage(bundle.name, publishedPackage, profile);
        })
    );
    return issuesByBundle.flat();
}

export const areTheTypesWrongRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema,
    perPackageSchema,
    run
};
