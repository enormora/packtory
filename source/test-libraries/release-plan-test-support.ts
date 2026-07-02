import assert from 'node:assert';
import { Result } from 'true-myth';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type {
    partialFailureType,
    ReleasePlan,
    ReleasePlanFailure,
    ReleasePlanPackage,
    ReleasePlanResult,
    ResolveAndLinkFailure
} from '../packtory/packtory-results.ts';
import type { ResolvedPackage } from '../packtory/resolved-package.ts';
import { createPlanReleaseAgainstLatestPublishedValidated } from '../packtory/packtory-release-plan.ts';
import { analyzedBundleResource } from './bundle-fixtures.ts';
import {
    buildResultFor,
    createReleaseTestDependencies,
    previousReleaseArtifactsFor,
    resolvedPackagesFor as sharedResolvedPackagesFor,
    validatedReleaseConfigFor,
    type ReleaseFileCollection,
    type ReleaseTestDependencies
} from './release-orchestrator-fixtures.ts';

type PackageProcessor = ReleaseTestDependencies['packageProcessor'];
type FileCollection = ReleaseFileCollection;
type ReleasePlanFileManager = ReleaseTestDependencies['fileManager'];
type ReleasePlanner = ReturnType<typeof createPlanReleaseAgainstLatestPublishedValidated>;
type ValidatedReleaseConfig = Parameters<ReleasePlanner>[0];
export type ReleasePackageResolver = Parameters<ReleasePlanner>[1];
type ReleasePlannerSpec = {
    readonly packageNames: readonly string[];
    readonly buildResults?: readonly BuildAndPublishResult[];
    readonly collectContents?: FileCollection;
    readonly currentGitHead?: string | undefined;
    readonly fileManager?: ReleasePlanFileManager | undefined;
    readonly packageProcessor?: PackageProcessor;
    readonly repositoryFolder?: string | undefined;
};
type ReleasePlanSpec = {
    readonly packageNames: readonly string[];
    readonly buildResults: readonly BuildAndPublishResult[];
    readonly collectContents: FileCollection;
    readonly bundleContents?: Readonly<Record<string, ResolvedPackage['analyzedBundle']['contents']>>;
    readonly currentGitHead?: string | undefined;
    readonly fileManager?: ReleasePlanFileManager | undefined;
    readonly repositoryFolder?: string | undefined;
};
export type ReleaseArtifactDescription = {
    readonly content: string;
    readonly filePath: string;
    readonly isExecutable: false;
};
type ReleasePlanPartialFailure = Extract<ReleasePlanFailure, { readonly type: typeof partialFailureType; }>;

export function createPlanner(spec: ReleasePlannerSpec): ReleasePlanner {
    return createPlanReleaseAgainstLatestPublishedValidated(createReleaseTestDependencies(spec));
}

export function resolvedPackagesFor(
    validated: ValidatedReleaseConfig,
    bundleContents: Readonly<Record<string, ResolvedPackage['analyzedBundle']['contents']>> = {}
): readonly ResolvedPackage[] {
    return sharedResolvedPackagesFor(validated, {
        bundleContents,
        defaultContents(packageName) {
            return [ analyzedBundleResource(`/source/${packageName}.js`, { targetFilePath: 'package/index.js' }) ];
        }
    });
}

export async function planFor(spec: ReleasePlanSpec): Promise<ReleasePlanResult> {
    const validated = validatedReleaseConfigFor(spec.packageNames);
    const plan = createPlanner({
        packageNames: spec.packageNames,
        buildResults: spec.buildResults,
        collectContents: spec.collectContents,
        currentGitHead: spec.currentGitHead,
        fileManager: spec.fileManager,
        repositoryFolder: spec.repositoryFolder
    });

    return plan(validated, async function () {
        return Result.ok<readonly ResolvedPackage[], ResolveAndLinkFailure>(
            resolvedPackagesFor(validated, spec.bundleContents)
        );
    });
}

export function publishedBuildResultFor(
    status: BuildAndPublishResult['status'] = 'new-version'
): BuildAndPublishResult {
    return buildResultFor({
        status,
        packageName: 'pkg-a',
        previousReleaseArtifacts: previousReleaseArtifactsFor({
            version: '1.0.0',
            publishedAt: new Date('2026-05-01T00:00:00.000Z'),
            files: [
                { filePath: 'package/index.js', content: 'old', isExecutable: false },
                { filePath: 'package/removed.js', content: 'removed', isExecutable: false }
            ]
        })
    });
}

export function expectPlan(result: ReleasePlanResult): ReleasePlan {
    if (result.isErr) {
        assert.fail(`Expected release plan, got ${result.error.type}`);
    }
    return result.value;
}

export function expectPartialFailure(result: ReleasePlanResult): ReleasePlanPartialFailure {
    if (result.isOk || result.error.type !== 'partial') {
        assert.fail('Expected a partial release-plan failure');
    }
    return result.error;
}

export function expectFirstPackage(result: ReleasePlanResult): ReleasePlanPackage {
    const [ pkg ] = expectPlan(result).packages;
    if (pkg === undefined) {
        assert.fail('Expected a package plan');
    }
    return pkg;
}
