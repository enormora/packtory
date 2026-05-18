import { Result } from 'true-myth';
import type { ValidConfigResult } from '../config/validation.ts';
import { determineVersionAndPublishAll, type PublishStageDependencies } from './stages/publish-stage.ts';
import { mapResolveFailureToPublishFailure } from './publish-failure-mapping.ts';
import {
    publishPartialFailure,
    type BuildAndPublishAllOptions,
    type PublishAllResult,
    type ResolveAndLinkFailure
} from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type ResolveAndLinkAllValidated = (
    config: ValidConfigResult
) => Promise<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>;

export function createRunBuildAndPublishValidated(
    dependencies: PublishStageDependencies
): (
    validated: ValidConfigResult,
    options: BuildAndPublishAllOptions,
    resolveAndLinkAllValidated: ResolveAndLinkAllValidated
) => Promise<PublishAllResult> {
    return async function runBuildAndPublishValidated(
        validated: ValidConfigResult,
        options: BuildAndPublishAllOptions,
        resolveAndLinkAllValidated: ResolveAndLinkAllValidated
    ): Promise<PublishAllResult> {
        const resolvedBundlesResult = await resolveAndLinkAllValidated(validated);
        if (resolvedBundlesResult.isErr) {
            return Result.err(mapResolveFailureToPublishFailure(resolvedBundlesResult.error));
        }

        const publishResult = await determineVersionAndPublishAll(
            dependencies,
            validated,
            resolvedBundlesResult.value,
            options
        );
        if (publishResult.isErr) {
            return Result.err(publishPartialFailure(publishResult.error));
        }
        return Result.ok(publishResult.value);
    };
}
