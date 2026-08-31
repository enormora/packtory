import { isDefined, pickBy } from 'remeda';
import { noPublication } from '../bundle-emitter/publication-outcome.ts';
import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import type {
    BuildAndPublishResult,
    DetermineVersionAndPublishOptions
} from './package-processor-publish-result.ts';
import type { PublishDependencies } from './package-processor-publish-dependencies.ts';
import { publishedReleaseStatus, wasAlreadyPublished } from './published-release-state.ts';

type PublishedTargetCheckResult = Awaited<ReturnType<BundleEmitter['verifyBundlePublishTarget']>>;

function publishTargetCheckOptions(
    result: BuildAndPublishResult,
    buildOptions: BuildAndPublishOptions
): Parameters<BundleEmitter['verifyBundlePublishTarget']>[0] {
    return pickBy(
        {
            bundle: result.bundle,
            registrySettings: buildOptions.registrySettings,
            extraFiles: result.extraFiles.length === 0 ? undefined : result.extraFiles
        },
        isDefined
    );
}

function finalizedAlreadyPublishedResult(
    result: BuildAndPublishResult,
    checkResult: PublishedTargetCheckResult
): BuildAndPublishResult {
    return {
        ...result,
        status: publishedReleaseStatus.alreadyPublished,
        publication: noPublication,
        previousReleaseArtifacts: checkResult.publishedArtifacts
    };
}

export async function verifyPublishTarget(
    dependencies: PublishDependencies,
    options: DetermineVersionAndPublishOptions,
    result: BuildAndPublishResult
): Promise<BuildAndPublishResult> {
    if (options.stage || wasAlreadyPublished(result)) {
        return result;
    }

    const checkResult = await dependencies.bundleEmitter.verifyBundlePublishTarget(
        publishTargetCheckOptions(result, options.buildOptions)
    );
    return checkResult.alreadyPublished ? finalizedAlreadyPublishedResult(result, checkResult) : result;
}
