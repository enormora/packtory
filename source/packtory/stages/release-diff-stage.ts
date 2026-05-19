import { Result } from 'true-myth';
import type { ArtifactsBuilder } from '../../artifacts/artifacts-builder.ts';
import type { ValidConfigResult } from '../../config/validation.ts';
import type { FileDescription } from '../../file-manager/file-description.ts';
import type { BuildReport, PackageReport } from '../../report/aggregator/report-types.ts';
import {
    buildFileSetDiff,
    type FileSetDiff,
    type PackageReleaseDiff
} from '../../report/release-diff/file-set-diff.ts';
import {
    buildReleaseVersionLabel,
    buildReleaseVersionTransition
} from '../../report/release-diff/release-version-transition.ts';
import type { BuildAndPublishResult } from '../package-processor.ts';
import type { PartialError, Scheduler as PacktoryScheduler } from '../scheduler.ts';

export type ReleaseDiffStageDependencies = {
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'collectContents'>;
    readonly scheduler: PacktoryScheduler;
};

type ExecOptions = {
    readonly packageName: string;
    readonly buildResult: BuildAndPublishResult | undefined;
    readonly packageReport: PackageReport | undefined;
};

type ExecResult = PackageReleaseDiff | undefined;

function emptyFileSetDiff(): FileSetDiff {
    return { added: [], removed: [], modified: [], unchanged: [] };
}

function asAddedFile(file: FileDescription): FileSetDiff['added'][number] {
    return {
        path: file.filePath,
        sizeBytes: Buffer.byteLength(file.content),
        isExecutable: file.isExecutable
    };
}

function asAddedFiles(files: readonly FileDescription[]): FileSetDiff {
    return { ...emptyFileSetDiff(), added: files.map(asAddedFile) };
}

function diffEntry(
    packageName: string,
    state: PackageReleaseDiff['state'],
    files: FileSetDiff,
    packageReport: PackageReport
): PackageReleaseDiff {
    return {
        name: packageName,
        state,
        versionTransition: buildReleaseVersionTransition(packageReport),
        previousVersionLabel: buildReleaseVersionLabel(packageReport),
        files,
        diagnostics: packageReport
    };
}

function classifyDiff(
    artifactsBuilder: ReleaseDiffStageDependencies['artifactsBuilder'],
    packageName: string,
    buildResult: BuildAndPublishResult,
    packageReport: PackageReport
): PackageReleaseDiff {
    if (buildResult.status === 'already-published') {
        return diffEntry(packageName, 'unchanged', emptyFileSetDiff(), packageReport);
    }
    const newSideFiles = artifactsBuilder.collectContents(buildResult.bundle, 'package', buildResult.extraFiles);
    if (buildResult.previousReleaseArtifacts.isNothing) {
        return diffEntry(packageName, 'first-publish', asAddedFiles(newSideFiles), packageReport);
    }
    const files = buildFileSetDiff(buildResult.previousReleaseArtifacts.value.files, newSideFiles);
    return diffEntry(packageName, 'changed', files, packageReport);
}

function isDiffEntry(entry: ExecResult): entry is PackageReleaseDiff {
    return entry !== undefined;
}

function toReleaseDiffs(entries: readonly ExecResult[]): readonly PackageReleaseDiff[] {
    return entries.filter(isDiffEntry);
}

function toPartialFailure(error: PartialError<ExecResult>): PartialError<PackageReleaseDiff> {
    return { succeeded: toReleaseDiffs(error.succeeded), failures: error.failures };
}

export async function runReleaseDiffStage(
    dependencies: ReleaseDiffStageDependencies,
    config: ValidConfigResult,
    succeededResults: readonly BuildAndPublishResult[],
    report: BuildReport
): Promise<Result<readonly PackageReleaseDiff[], PartialError<PackageReleaseDiff>>> {
    const successByName = new Map(
        succeededResults.map((result) => {
            return [result.bundle.name, result] as const;
        })
    );

    const stageResult = await dependencies.scheduler.runForEachScheduledPackage<
        ExecResult,
        string,
        ExecOptions,
        typeof config.packtoryConfig
    >({
        config,
        createOptions: (context) => {
            return {
                packageName: context.packageName,
                buildResult: successByName.get(context.packageName),
                packageReport: report.packages[context.packageName]
            };
        },
        execute: async (options) => {
            if (options.buildResult === undefined || options.packageReport === undefined) {
                return undefined;
            }
            return classifyDiff(
                dependencies.artifactsBuilder,
                options.packageName,
                options.buildResult,
                options.packageReport
            );
        },
        selectNext: (params) => {
            return params.options.packageName;
        },
        emitScheduledEvents: false
    });

    if (stageResult.isErr) {
        return Result.err(toPartialFailure(stageResult.error));
    }
    return Result.ok(toReleaseDiffs(stageResult.value));
}
