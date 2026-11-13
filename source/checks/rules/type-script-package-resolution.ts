import type {
    Analysis,
    CheckResult,
    Package as TypesPackage,
    Problem,
    ProblemKind,
    ResolutionKind
} from '@arethetypeswrong/core';
import type { problemKindInfo as ProblemKindInformation } from '@arethetypeswrong/core/problems';
import { z } from 'zod/mini';
import type { AnalysisStorage } from '../analysis-storage.ts';
import { createPackageAnalysisIdentity } from '../package-analysis-identity.ts';
import { installedPackageFilePath } from '../../common/package-layout.ts';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';

export type ResolutionProblemReport = {
    readonly kind: ProblemKind;
    readonly shortDescription: string;
    readonly affectedResolutionKinds: readonly ResolutionKind[];
    readonly affectedEntrypoints: readonly string[];
};

type AnalyzedResolutionReport = {
    readonly kind: 'analyzed';
    readonly entrypoints: readonly string[];
    readonly problems: readonly ResolutionProblemReport[];
};

type MissingDeclarationsReport = {
    readonly kind: 'missing-declarations';
};

export type PackageResolutionReport = AnalyzedResolutionReport | MissingDeclarationsReport;

export type PackageResolutionAnalyzer = (
    publishedPackage: Readonly<PublishedPackageWithManifest>,
    resolutionKinds: readonly ResolutionKind[]
) => Promise<PackageResolutionReport>;

export type PackageResolutionDependencies = {
    readonly storage: AnalysisStorage;
    readonly Package: typeof TypesPackage;
    readonly checkPackage: (typesPackage: TypesPackage) => Promise<CheckResult>;
    readonly problemKindInformation: typeof ProblemKindInformation;
    readonly problemAffectsResolutionKind: (
        problem: Problem,
        resolutionKind: ResolutionKind,
        analysis: Analysis
    ) => boolean;
    readonly problemAffectsEntrypointResolution: (
        problem: Problem,
        entrypoint: string,
        resolutionKind: ResolutionKind,
        analysis: Analysis
    ) => boolean;
};

function packageFileContents(
    publishedPackage: Readonly<PublishedPackageWithManifest>
): Record<string, Uint8Array | string> {
    const files: Record<string, Uint8Array | string> = {
        [installedPackageFilePath(publishedPackage.name, publishedPackage.manifestFile.filePath)]:
            publishedPackage.manifestFile.content
    };

    for (const entry of publishedPackage.contents) {
        files[installedPackageFilePath(publishedPackage.name, entry.fileDescription.targetFilePath)] = entry
            .fileDescription
            .content;
    }

    return files;
}

export function createPackageResolutionAnalyzer(
    dependencies: PackageResolutionDependencies
): PackageResolutionAnalyzer {
    const {
        Package,
        checkPackage,
        problemKindInformation,
        problemAffectsResolutionKind,
        problemAffectsEntrypointResolution
    } = dependencies;
    const identities = createPackageAnalysisIdentity();
    const reportSchema = z.union([
        z.object({ kind: z.literal('missing-declarations') }),
        z.object({
            kind: z.literal('analyzed'),
            entrypoints: z.array(z.string()),
            problems: z.array(z.object({
                kind: z.custom<ProblemKind>(function (value) {
                    return typeof value === 'string' && Object.hasOwn(problemKindInformation, value);
                }),
                shortDescription: z.string(),
                affectedResolutionKinds: z.array(z.enum([ 'node10', 'node16-cjs', 'node16-esm', 'bundler' ])),
                affectedEntrypoints: z.array(z.string())
            }))
        })
    ]);

    function toProblemReport(
        problem: Problem,
        analysis: Analysis,
        resolutionKinds: readonly ResolutionKind[]
    ): ResolutionProblemReport {
        return {
            kind: problem.kind,
            shortDescription: problemKindInformation[problem.kind].shortDescription,
            affectedResolutionKinds: resolutionKinds.filter(function (resolutionKind) {
                return problemAffectsResolutionKind(problem, resolutionKind, analysis);
            }),
            affectedEntrypoints: Object.keys(analysis.entrypoints).filter(function (entrypoint) {
                return resolutionKinds.some(function (resolutionKind) {
                    return problemAffectsEntrypointResolution(problem, entrypoint, resolutionKind, analysis);
                });
            })
        };
    }

    async function analyzePackageResolution(
        publishedPackage: Readonly<PublishedPackageWithManifest>,
        resolutionKinds: readonly ResolutionKind[]
    ): Promise<PackageResolutionReport> {
        const result = await checkPackage(
            new Package(packageFileContents(publishedPackage), publishedPackage.name, publishedPackage.version)
        );

        if (result.types === false) {
            return { kind: 'missing-declarations' };
        }

        return {
            kind: 'analyzed',
            entrypoints: Object.keys(result.entrypoints),
            problems: result.problems.map(function (problem) {
                return toProblemReport(problem, result, resolutionKinds);
            })
        };
    }
    return async function (publishedPackage, resolutionKinds) {
        const key = [
            publishedPackage.name,
            publishedPackage.version,
            resolutionKinds,
            identities.package(publishedPackage)
        ];
        const cached = await dependencies.storage.read(key, reportSchema);
        if (cached !== null) {
            return cached;
        }
        const report = await analyzePackageResolution(publishedPackage, resolutionKinds);
        await dependencies.storage.write(key, report);
        return report;
    };
}
