import { isDefined, pickBy } from 'remeda';
import { noPublication, publishedToRegistry } from '../bundle-emitter/publication-outcome.ts';
import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { SbomFileBuilder } from '../sbom/sbom-file.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { BuildAndPublishOptions } from './map-config.ts';
import { createVersionProviderContext } from './options/version-provider-context.ts';
import { determineBuildVersion, inferVersionTrigger, shouldIncreaseVersion } from './options/version-trigger.ts';
import { publishedReleaseStatus, type PublishedReleaseStatus, wasAlreadyPublished } from './published-release-state.ts';

export type PublishDependencies = {
    readonly bundleEmitter: BundleEmitter;
    readonly fileManager: {
        readonly checkReadability: (fileOrFolderPath: string) => Promise<{ readonly isReadable: boolean; }>;
        readonly readFile: (filePath: string) => Promise<string>;
    };
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly repositoryFolder: string;
    readonly sbomFileBuilder: SbomFileBuilder;
    readonly versionManager: VersionManager;
};

type VersionedBundleWithManifest = Awaited<ReturnType<PublishDependencies['versionManager']['addVersion']>>;
type CurrentVersion = Awaited<ReturnType<PublishDependencies['bundleEmitter']['determineCurrentVersion']>>;
type PublicationOutcome = Awaited<ReturnType<PublishDependencies['bundleEmitter']['publish']>>;
type PublishedCheckResult = Awaited<ReturnType<PublishDependencies['bundleEmitter']['checkBundleAlreadyPublished']>>;
type CurrentHeadPublishedVersion = Awaited<
    ReturnType<PublishDependencies['bundleEmitter']['findCurrentHeadPublishedVersion']>
>;
type PreviousReleaseArtifacts = Readonly<PublishedCheckResult['previousReleaseArtifacts']>;
type ExtraFiles = Exclude<Awaited<ReturnType<PublishDependencies['sbomFileBuilder']['generate']>>, undefined>;
type SiblingPackage = Parameters<PublishDependencies['sbomFileBuilder']['generate']>[1][number];
type AnalyzedBundle = Parameters<VersionManager['addVersion']>[0]['bundle'];
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
export type BuildAndPublishResult = {
    readonly status: PublishedReleaseStatus;
    readonly bundle: VersionedBundleWithManifest;
    readonly publication: PublicationOutcome;
    readonly extraFiles: ExtraFiles;
    readonly previousReleaseArtifacts: PreviousReleaseArtifacts;
};

export type DetermineVersionAndPublishOptions = {
    readonly analyzedBundle: AnalyzedBundle;
    readonly buildOptions: BuildAndPublishOptions;
    readonly stage: boolean;
    readonly substitutionPublicModuleSourcePaths?: ReadonlySet<string> | undefined;
};

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
): Parameters<BundleEmitter['checkBundleAlreadyPublished']>[0] {
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
): Parameters<BundleEmitter['publish']>[0] {
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

    function emitVersionDetermined(args: VersionDeterminedInput): void {
        if (!dependencies.progressBroadcaster.hasSubscribers('versionDetermined')) {
            return;
        }
        dependencies.progressBroadcaster.emit('versionDetermined', {
            packageName: args.options.name,
            previousVersion: args.currentVersion.isJust ? args.currentVersion.value : undefined,
            chosenVersion: args.chosenVersion,
            trigger: inferVersionTrigger(args.currentVersion, args.options, args.didBump)
        });
    }

    function finalizeWithoutBump(
        buildContext: VersionedBundleBuildContext,
        options: BuildAndPublishOptions,
        status: BuildAndPublishResult['status'],
        extras: FinalizeWithoutBumpExtras
    ): BuildAndPublishResult {
        emitVersionDetermined({
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
        emitVersionDetermined({
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
            return buildPendingPublish(options);
        }
        return currentHeadPublishAttempt ??
            await tryFinalizeCurrentProviderVersion(options) ??
            await buildPendingPublish(options);
    }

    async function buildAndPublish(options: DetermineVersionAndPublishOptions): Promise<BuildAndPublishResult> {
        const result = await tryBuildAndPublish(options);
        if (wasAlreadyPublished(result)) {
            return result;
        }

        dependencies.progressBroadcaster.emit('publishing', {
            packageName: options.buildOptions.name,
            version: result.bundle.version
        });
        return publishPreparedResultOrRecover(dependencies, options, result);
    }

    return { buildAndPublish, tryBuildAndPublish };
}
