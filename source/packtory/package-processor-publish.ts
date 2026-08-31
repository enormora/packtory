import { isDefined, pickBy } from 'remeda';
import { noPublication, publishedToRegistry } from '../bundle-emitter/publication-outcome.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import { createVersionProviderContext } from './options/version-provider-context.ts';
import { determineBuildVersion, inferVersionTrigger, shouldIncreaseVersion } from './options/version-trigger.ts';
import type { PublishDependencies } from './package-processor-publish-dependencies.ts';
import type {
    AnalyzedBundle,
    BuildAndPublishResult,
    CurrentHeadPublishedVersion,
    CurrentVersion,
    DetermineVersionAndPublishOptions,
    ExtraFiles,
    PreviousReleaseArtifacts,
    SiblingPackage,
    VersionedBundleWithManifest
} from './package-processor-publish-result.ts';
import { verifyPublishTarget } from './publish-target-preflight.ts';
import { publishedReleaseStatus, wasAlreadyPublished } from './published-release-state.ts';

type PublishedCheckResult = Awaited<ReturnType<PublishDependencies['bundleEmitter']['checkBundleAlreadyPublished']>>;
type MainPackageTypeField = { readonly type?: string | undefined; };
type VersionedBundleBuildContext = {
    readonly versionedBundle: VersionedBundleWithManifest;
    readonly currentVersion: CurrentVersion;
    readonly version: string;
};
type VersionDeterminedInput = {
    readonly options: BuildAndPublishOptions;
    readonly currentVersion: CurrentVersion;
    readonly chosenVersion: string;
    readonly didBump: boolean;
};
type CurrentHeadPublishAttempt = BuildAndPublishResult | false | undefined;
type FinalizeWithoutBumpExtras = {
    readonly extraFiles: ExtraFiles;
    readonly previousReleaseArtifacts: PreviousReleaseArtifacts;
};
type BuildVersionedBundleForVersionInput = {
    readonly dependencies: PublishDependencies;
    readonly analyzedBundle: AnalyzedBundle;
    readonly options: BuildAndPublishOptions;
    readonly version: string;
    readonly substitutionPublicModuleSourcePaths: ReadonlySet<string> | undefined;
};
type PublishRecoveryInput = {
    readonly dependencies: PublishDependencies;
    readonly options: DetermineVersionAndPublishOptions;
    readonly result: BuildAndPublishResult;
};
type ConfirmedPublishInput = PublishRecoveryInput & {
    readonly candidate: Exclude<CurrentHeadPublishedVersion, undefined>;
    readonly published: PublishedCheckResult;
};
const unconfirmedPublishRecovery = Symbol('unconfirmedPublishRecovery');
type PublishRecoveryAttempt = BuildAndPublishResult | typeof unconfirmedPublishRecovery;
function assertEsmMainPackageJson(mainPackageJson: MainPackageTypeField): void {
    if (mainPackageJson.type !== 'module') {
        throw new Error('mainPackageJson.type must be "module"');
    }
}

function siblingsFromOptions(buildOptions: BuildAndPublishOptions): readonly SiblingPackage[] {
    return [ ...buildOptions.bundleDependencies, ...buildOptions.bundlePeerDependencies ];
}

function usesVersionProvider(versioning: BuildAndPublishOptions['versioning']): boolean {
    return Object.hasOwn(versioning, 'provideVersion');
}

function buildVersionedBundleForVersion(input: BuildVersionedBundleForVersionInput): VersionedBundleWithManifest {
    const { dependencies, analyzedBundle, options, version, substitutionPublicModuleSourcePaths } = input;
    dependencies.progressBroadcaster.emit('building', { packageName: options.name, version });
    return dependencies.versionManager.addVersion({
        bundle: analyzedBundle,
        ...options,
        version,
        substitutionPublicModuleSourcePaths
    });
}

function emitVersionDetermined(dependencies: PublishDependencies, input: VersionDeterminedInput): void {
    if (!dependencies.progressBroadcaster.hasSubscribers('versionDetermined')) {
        return;
    }
    dependencies.progressBroadcaster.emit('versionDetermined', {
        packageName: input.options.name,
        previousVersion: input.currentVersion.isJust ? input.currentVersion.value : undefined,
        chosenVersion: input.chosenVersion,
        trigger: inferVersionTrigger(input.currentVersion, input.options, input.didBump)
    });
}

async function generateExtraFiles(
    dependencies: PublishDependencies,
    versionedBundle: VersionedBundleWithManifest,
    buildOptions: BuildAndPublishOptions
): Promise<ExtraFiles> {
    const result = await dependencies.sbomFileBuilder.generate(
        versionedBundle,
        siblingsFromOptions(buildOptions),
        buildOptions.publishSettings
    );
    return result ?? [];
}

function checkAlreadyPublishedOptions(
    versionedBundle: VersionedBundleWithManifest,
    buildOptions: BuildAndPublishOptions,
    extraFiles: ExtraFiles
): Parameters<PublishDependencies['bundleEmitter']['checkBundleAlreadyPublished']>[0] {
    return pickBy(
        {
            bundle: versionedBundle,
            registrySettings: buildOptions.registrySettings,
            extraFiles: extraFiles.length === 0 ? undefined : extraFiles
        },
        isDefined
    );
}

async function checkBundleAlreadyPublished(
    dependencies: PublishDependencies,
    versionedBundle: VersionedBundleWithManifest,
    buildOptions: BuildAndPublishOptions,
    extraFiles: ExtraFiles
): Promise<PublishedCheckResult> {
    return dependencies.bundleEmitter.checkBundleAlreadyPublished(
        checkAlreadyPublishedOptions(versionedBundle, buildOptions, extraFiles)
    );
}

function isVerifiedFinalizedPublish(
    candidate: Exclude<CurrentHeadPublishedVersion, undefined>,
    result: PublishedCheckResult
): boolean {
    if (!result.alreadyPublishedAsLatest || result.previousReleaseArtifacts.isNothing) {
        return false;
    }
    return (
        result.previousReleaseArtifacts.value.version === candidate.version &&
        result.previousReleaseArtifacts.value.gitHead === candidate.gitHead
    );
}

function hasRecoveredPublishedVersion(
    candidate: CurrentHeadPublishedVersion,
    result: BuildAndPublishResult
): candidate is Exclude<CurrentHeadPublishedVersion, undefined> {
    if (candidate === undefined) {
        return false;
    }
    return candidate.version === result.bundle.version;
}

function publishRequest(
    options: DetermineVersionAndPublishOptions,
    result: BuildAndPublishResult
): Parameters<PublishDependencies['bundleEmitter']['publish']>[0] {
    return pickBy(
        {
            bundle: result.bundle,
            registrySettings: options.buildOptions.registrySettings,
            publishSettings: options.buildOptions.publishSettings,
            stage: options.stage,
            extraFiles: result.extraFiles.length === 0 ? undefined : result.extraFiles
        },
        isDefined
    );
}

async function findRecoveryCandidate(
    input: PublishRecoveryInput
): Promise<CurrentHeadPublishedVersion> {
    const { dependencies, options } = input;
    const lookup = {
        name: options.buildOptions.name,
        registrySettings: options.buildOptions.registrySettings
    };
    return dependencies.bundleEmitter.findCurrentHeadPublishedVersion(lookup);
}

function confirmPublishedPackage(input: ConfirmedPublishInput): BuildAndPublishResult | undefined {
    const { candidate, published, result } = input;
    if (!isVerifiedFinalizedPublish(candidate, published)) {
        return undefined;
    }
    return {
        ...result,
        publication: publishedToRegistry,
        previousReleaseArtifacts: published.previousReleaseArtifacts
    };
}

async function confirmPublishedPackageAfterFailure(
    input: PublishRecoveryInput
): Promise<BuildAndPublishResult | undefined> {
    const candidate = await findRecoveryCandidate(input);
    if (!hasRecoveredPublishedVersion(candidate, input.result)) {
        return undefined;
    }

    const published = await checkBundleAlreadyPublished(
        input.dependencies,
        input.result.bundle,
        input.options.buildOptions,
        input.result.extraFiles
    );

    return confirmPublishedPackage({ ...input, candidate, published });
}

async function recoverPublishedPackageAfterFailure(
    input: PublishRecoveryInput
): Promise<BuildAndPublishResult | undefined> {
    if (input.options.stage) {
        return undefined;
    }
    return confirmPublishedPackageAfterFailure(input);
}

function publishRecoveryAttempt(result: BuildAndPublishResult | undefined): PublishRecoveryAttempt {
    return result ?? unconfirmedPublishRecovery;
}

async function attemptPublishRecovery(input: PublishRecoveryInput): Promise<PublishRecoveryAttempt> {
    return publishRecoveryAttempt(await recoverPublishedPackageAfterFailure(input));
}

async function publishPreparedResult(
    dependencies: PublishDependencies,
    options: DetermineVersionAndPublishOptions,
    result: BuildAndPublishResult
): Promise<BuildAndPublishResult> {
    const publication = await dependencies.bundleEmitter.publish(publishRequest(options, result));
    return { ...result, publication };
}

async function publishPreparedResultOrRecover(
    dependencies: PublishDependencies,
    options: DetermineVersionAndPublishOptions,
    result: BuildAndPublishResult
): Promise<BuildAndPublishResult> {
    try {
        return await publishPreparedResult(dependencies, options, result);
    } catch (publishError: unknown) {
        const recovery = await attemptPublishRecovery({ dependencies, options, result });
        if (recovery !== unconfirmedPublishRecovery) {
            return recovery;
        }
        throw publishError;
    }
}

async function tryFinalizePublishedCurrentHead(
    dependencies: PublishDependencies,
    options: DetermineVersionAndPublishOptions
): Promise<CurrentHeadPublishAttempt> {
    const candidate = options.stage
        ? undefined
        : await dependencies.bundleEmitter.findCurrentHeadPublishedVersion({
            name: options.buildOptions.name,
            registrySettings: options.buildOptions.registrySettings
        });
    if (candidate === undefined) {
        return undefined;
    }

    const versionedBundle = buildVersionedBundleForVersion({
        dependencies,
        analyzedBundle: options.analyzedBundle,
        options: options.buildOptions,
        version: candidate.version,
        substitutionPublicModuleSourcePaths: options.substitutionPublicModuleSourcePaths
    });
    const extraFiles = await generateExtraFiles(dependencies, versionedBundle, options.buildOptions);
    const alreadyPublished = await checkBundleAlreadyPublished(
        dependencies,
        versionedBundle,
        options.buildOptions,
        extraFiles
    );

    if (!isVerifiedFinalizedPublish(candidate, alreadyPublished)) {
        return false;
    }

    return {
        bundle: versionedBundle,
        status: publishedReleaseStatus.alreadyPublished,
        publication: noPublication,
        extraFiles,
        previousReleaseArtifacts: alreadyPublished.previousReleaseArtifacts
    };
}

export type PublishOperations = {
    readonly buildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
    readonly publishPreparedPackage: (
        options: DetermineVersionAndPublishOptions,
        result: BuildAndPublishResult
    ) => Promise<BuildAndPublishResult>;
    readonly tryBuildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
};

export function createPublishOperations(dependencies: PublishDependencies): PublishOperations {
    async function buildVersionedBundle(
        analyzedBundle: AnalyzedBundle,
        options: BuildAndPublishOptions,
        stage: boolean,
        substitutionPublicModuleSourcePaths: ReadonlySet<string> | undefined
    ): Promise<VersionedBundleBuildContext> {
        assertEsmMainPackageJson(options.mainPackageJson);
        const currentVersion = await dependencies.bundleEmitter.determineCurrentVersion({
            name: analyzedBundle.name,
            registrySettings: options.registrySettings,
            stage,
            versioning: options.versioning
        });
        const version = await determineBuildVersion(
            currentVersion,
            options,
            await createVersionProviderContext(dependencies, analyzedBundle, options, stage)
        );
        const versionedBundle = buildVersionedBundleForVersion({
            dependencies,
            analyzedBundle,
            options,
            version,
            substitutionPublicModuleSourcePaths
        });
        return { versionedBundle, currentVersion, version };
    }

    function finalizeWithoutBump(
        buildContext: VersionedBundleBuildContext,
        options: BuildAndPublishOptions,
        status: BuildAndPublishResult['status'],
        extras: FinalizeWithoutBumpExtras
    ): BuildAndPublishResult {
        emitVersionDetermined(dependencies, {
            options,
            currentVersion: buildContext.currentVersion,
            chosenVersion: buildContext.versionedBundle.version,
            didBump: false
        });
        return {
            bundle: buildContext.versionedBundle,
            status,
            publication: noPublication,
            extraFiles: extras.extraFiles,
            previousReleaseArtifacts: extras.previousReleaseArtifacts
        };
    }

    async function bumpVersion(
        buildContext: VersionedBundleBuildContext,
        options: BuildAndPublishOptions
    ): Promise<VersionedBundleWithManifest> {
        dependencies.progressBroadcaster.emit('rebuilding', {
            packageName: options.name,
            version: buildContext.version
        });
        const newVersionedBundle = dependencies.versionManager.increaseVersion(buildContext.versionedBundle);
        emitVersionDetermined(dependencies, {
            options,
            currentVersion: buildContext.currentVersion,
            chosenVersion: newVersionedBundle.version,
            didBump: true
        });
        return newVersionedBundle;
    }

    function tryFinalizeWithoutBump(
        buildContext: VersionedBundleBuildContext,
        options: BuildAndPublishOptions,
        alreadyPublished: PublishedCheckResult,
        extraFiles: ExtraFiles
    ): BuildAndPublishResult | undefined {
        const extras = { extraFiles, previousReleaseArtifacts: alreadyPublished.previousReleaseArtifacts };
        if (alreadyPublished.alreadyPublishedAsLatest) {
            return finalizeWithoutBump(buildContext, options, publishedReleaseStatus.alreadyPublished, extras);
        }
        if (!shouldIncreaseVersion(buildContext.currentVersion, options)) {
            return finalizeWithoutBump(
                buildContext,
                options,
                buildContext.currentVersion.isJust
                    ? publishedReleaseStatus.newVersion
                    : publishedReleaseStatus.initialVersion,
                extras
            );
        }
        return undefined;
    }

    async function tryFinalizeCurrentProviderVersion(
        options: DetermineVersionAndPublishOptions
    ): Promise<BuildAndPublishResult | undefined> {
        const currentVersion = await dependencies.bundleEmitter.determineCurrentVersion({
            name: options.analyzedBundle.name,
            registrySettings: options.buildOptions.registrySettings,
            stage: options.stage,
            versioning: options.buildOptions.versioning
        });
        if (!usesVersionProvider(options.buildOptions.versioning) || currentVersion.isNothing) {
            return undefined;
        }
        const versionedBundle = buildVersionedBundleForVersion({
            dependencies,
            analyzedBundle: options.analyzedBundle,
            options: options.buildOptions,
            version: currentVersion.value,
            substitutionPublicModuleSourcePaths: options.substitutionPublicModuleSourcePaths
        });
        const extraFiles = await generateExtraFiles(dependencies, versionedBundle, options.buildOptions);
        const alreadyPublished = await checkBundleAlreadyPublished(
            dependencies,
            versionedBundle,
            options.buildOptions,
            extraFiles
        );
        return alreadyPublished.alreadyPublishedAsLatest
            ? {
                bundle: versionedBundle,
                status: publishedReleaseStatus.alreadyPublished,
                publication: noPublication,
                extraFiles,
                previousReleaseArtifacts: alreadyPublished.previousReleaseArtifacts
            }
            : undefined;
    }

    async function buildPendingPublish(options: DetermineVersionAndPublishOptions): Promise<BuildAndPublishResult> {
        const buildContext = await buildVersionedBundle(
            options.analyzedBundle,
            options.buildOptions,
            options.stage,
            options.substitutionPublicModuleSourcePaths
        );
        const preBumpExtraFiles = await generateExtraFiles(
            dependencies,
            buildContext.versionedBundle,
            options.buildOptions
        );
        const alreadyPublished = await checkBundleAlreadyPublished(
            dependencies,
            buildContext.versionedBundle,
            options.buildOptions,
            preBumpExtraFiles
        );
        const finalizedWithoutBump = tryFinalizeWithoutBump(
            buildContext,
            options.buildOptions,
            alreadyPublished,
            preBumpExtraFiles
        );

        if (finalizedWithoutBump !== undefined) {
            return finalizedWithoutBump;
        }
        const newVersionedBundle = usesVersionProvider(options.buildOptions.versioning)
            ? buildContext.versionedBundle
            : await bumpVersion(buildContext, options.buildOptions);
        const extraFiles = await generateExtraFiles(dependencies, newVersionedBundle, options.buildOptions);
        return {
            bundle: newVersionedBundle,
            status: buildContext.currentVersion.isJust
                ? publishedReleaseStatus.newVersion
                : publishedReleaseStatus.initialVersion,
            publication: noPublication,
            extraFiles,
            previousReleaseArtifacts: alreadyPublished.previousReleaseArtifacts
        };
    }

    async function tryBuildAndPublish(options: DetermineVersionAndPublishOptions): Promise<BuildAndPublishResult> {
        assertEsmMainPackageJson(options.buildOptions.mainPackageJson);
        const currentHeadPublishAttempt = await tryFinalizePublishedCurrentHead(dependencies, options);
        if (currentHeadPublishAttempt === false) {
            return verifyPublishTarget(dependencies, options, await buildPendingPublish(options));
        }
        const result = currentHeadPublishAttempt ??
            await tryFinalizeCurrentProviderVersion(options) ??
            await buildPendingPublish(options);
        return verifyPublishTarget(dependencies, options, result);
    }

    async function publishPreparedPackage(
        options: DetermineVersionAndPublishOptions,
        result: BuildAndPublishResult
    ): Promise<BuildAndPublishResult> {
        if (wasAlreadyPublished(result)) {
            return result;
        }

        dependencies.progressBroadcaster.emit('publishing', {
            packageName: options.buildOptions.name,
            version: result.bundle.version
        });
        return publishPreparedResultOrRecover(dependencies, options, result);
    }

    async function buildAndPublish(options: DetermineVersionAndPublishOptions): Promise<BuildAndPublishResult> {
        return publishPreparedPackage(options, await tryBuildAndPublish(options));
    }

    return { buildAndPublish, publishPreparedPackage, tryBuildAndPublish };
}
