import assert from 'node:assert';
import { Maybe } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { validateConfiguration, type ValidConfigurationResult } from '../configuration/validation.ts';
import type { ProgressBroadcaster } from '../packtory/packtory-results.ts';
import type { BuildAndPublishResult, PackageProcessor } from '../packtory/package-processor.ts';
import type { ResolvedPackage } from '../packtory/resolved-package.ts';
import type { Scheduler as PackageScheduler } from '../packtory/scheduler.ts';
import { analyzedBundle, versionedBundleWithManifest } from './bundle-fixtures.ts';
import { createIteratingScheduler } from './iterating-scheduler.ts';

export type ReleaseFileCollection = ArtifactsBuilder['collectContents'];

type ReleaseArtifactFile = {
    readonly content: string;
    readonly filePath: string;
    readonly isExecutable: boolean;
};

type ReleasePlanFileReader = {
    readonly checkReadability: (fileOrFolderPath: string) => Promise<{ readonly isReadable: boolean; }>;
    readonly readFile: (filePath: string) => Promise<string>;
};

type ReleaseCurrentGitHeadReader = () => Promise<string | undefined>;

type PreviousReleaseArtifactsSpecification = {
    readonly version: string;
    readonly publishedAt: Date;
    readonly gitHead?: string | undefined;
    readonly files: readonly ReleaseArtifactFile[];
};

type ResolvedPackagesOptions = {
    readonly bundleContents?: Readonly<Record<string, ResolvedPackage['analyzedBundle']['contents']>>;
    readonly defaultContents?: (packageName: string) => ResolvedPackage['analyzedBundle']['contents'];
};

type ReleasePackageConfiguration = ValidConfigurationResult['packtoryConfiguration']['packages'][number];

export type ReleaseTestDependencies = {
    readonly artifactsBuilder: { readonly collectContents: ReleaseFileCollection; };
    readonly fileManager: ReleasePlanFileReader;
    readonly packageProcessor: PackageProcessor;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly readCurrentGitHead: ReleaseCurrentGitHeadReader;
    readonly repositoryFolder: string;
    readonly scheduler: PackageScheduler;
};

type ReleaseTestDependencySpecification = {
    readonly packageNames: readonly string[];
    readonly buildResults?: readonly BuildAndPublishResult[];
    readonly collectContents?: ReleaseFileCollection;
    readonly currentGitHead?: string | undefined;
    readonly fileManager?: ReleasePlanFileReader | undefined;
    readonly packageProcessor?: PackageProcessor;
    readonly repositoryFolder?: string | undefined;
};

type BuildResultOverrides = Partial<BuildAndPublishResult> & {
    readonly packageName?: string;
    readonly version?: string;
};

type ReleasePackageProcessorOperation = Exclude<keyof PackageProcessor, 'tryBuildAndPublish'>;
type ReleasePackageProcessorOperations = Pick<PackageProcessor, ReleasePackageProcessorOperation>;

const noPublicationOutcome = { type: 'none' } as const;

const releaseProgressBroadcaster: ProgressBroadcaster = {
    consumer: {
        off() {
            return undefined;
        },
        on() {
            return undefined;
        }
    },
    provider: {
        emit() {
            return undefined;
        },
        hasSubscribers() {
            return false;
        }
    }
};

const defaultReleasePlanFileReader: ReleasePlanFileReader = {
    async checkReadability() {
        return { isReadable: true };
    },
    async readFile() {
        return '';
    }
};

const releasePackageProcessorOperations: ReleasePackageProcessorOperations = {
    async build() {
        throw new Error('build() should not be called in release tests');
    },
    async buildAndPublish() {
        throw new Error('buildAndPublish() should not be called in release dry runs');
    },
    async publishPreparedPackage() {
        throw new Error('publishPreparedPackage() should not be called in release dry runs');
    },
    async resolveAndLink() {
        throw new Error('resolveAndLink() should not be called in release tests');
    },
    async resolveAndLinkWithPromotedDeclarationCompanions() {
        throw new Error('resolveAndLinkWithPromotedDeclarationCompanions() should not be called in release tests');
    }
};

export function validatedReleaseConfigurationFor(packageNames: readonly string[]): ValidConfigurationResult {
    const result = validateConfiguration({
        registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
        packages: packageNames.map(function (name) {
            return {
                mainPackageManifest: { type: 'module' },
                name,
                publishSettings: { access: 'public' },
                roots: { main: { javaScript: `source/${name}.js` } },
                sourcesFolder: 'source'
            };
        })
    });

    if (result.isErr) {
        assert.fail(`Expected config to validate: ${result.error.join(', ')}`);
    }

    return result.value;
}

function packageProcessorFor(
    buildResults: readonly BuildAndPublishResult[],
    onMissingResult: () => never
): PackageProcessor {
    let invocation = 0;

    return {
        ...releasePackageProcessorOperations,
        async tryBuildAndPublish() {
            const result = buildResults[invocation];
            invocation += 1;
            if (result === undefined) {
                return onMissingResult();
            }

            return result;
        }
    };
}

function packageProcessorWith(buildResults: readonly BuildAndPublishResult[]): PackageProcessor {
    return packageProcessorFor(buildResults, function () {
        throw new Error('Missing build result fixture');
    });
}

export function packageProcessorWithFailure(
    buildResults: readonly BuildAndPublishResult[],
    failure: Error
): PackageProcessor {
    return packageProcessorFor(buildResults, function () {
        throw failure;
    });
}

export function buildResultFor(overrides: BuildResultOverrides = {}): BuildAndPublishResult {
    const packageName = overrides.packageName ?? 'package-a';
    const version = overrides.version ?? '1.0.1';

    return {
        status: 'new-version',
        publication: noPublicationOutcome,
        bundle: versionedBundleWithManifest({
            name: packageName,
            version,
            packageManifest: { name: packageName, version }
        }),
        extraFiles: [],
        previousReleaseArtifacts: Maybe.nothing(),
        ...overrides
    };
}

export function packageProcessorCheckingStage(expectedStage: boolean): PackageProcessor {
    return {
        ...releasePackageProcessorOperations,
        async tryBuildAndPublish(options) {
            assert.strictEqual(options.stage, expectedStage);
            return buildResultFor();
        }
    };
}

export function previousReleaseArtifactsFor(
    input: PreviousReleaseArtifactsSpecification
): BuildAndPublishResult['previousReleaseArtifacts'] {
    return Maybe.just({
        version: input.version,
        publishedAt: input.publishedAt,
        gitHead: input.gitHead,
        files: input.files
    });
}

export function createReleaseTestDependencies(input: ReleaseTestDependencySpecification): ReleaseTestDependencies {
    return {
        artifactsBuilder: {
            collectContents: input.collectContents ??
                function () {
                    return [];
                }
        },
        fileManager: input.fileManager ?? defaultReleasePlanFileReader,
        packageProcessor: input.packageProcessor ?? packageProcessorWith(input.buildResults ?? []),
        progressBroadcaster: releaseProgressBroadcaster,
        async readCurrentGitHead() {
            return input.currentGitHead;
        },
        repositoryFolder: input.repositoryFolder ?? '/',
        scheduler: createIteratingScheduler(input.packageNames)
    };
}

function resolvePackageContents(
    packageName: string,
    options: ResolvedPackagesOptions
): ResolvedPackage['analyzedBundle']['contents'] {
    return options.bundleContents?.[packageName] ?? options.defaultContents?.(packageName) ?? [];
}

function releasePackageSourcesFolder(packageConfiguration: ReleasePackageConfiguration): string {
    return packageConfiguration.sourcesFolder ?? 'source';
}

function releasePackageMainPackageManifest(
    validated: ValidConfigurationResult,
    packageConfiguration: ReleasePackageConfiguration
): ResolvedPackage['resolveOptions']['mainPackageManifest'] {
    return packageConfiguration.mainPackageManifest ??
        validated.packtoryConfiguration.commonPackageSettings?.mainPackageManifest ?? { type: 'module' };
}

function releasePackageAdditionalChangelogSourceFiles(
    validated: ValidConfigurationResult,
    packageConfiguration: ReleasePackageConfiguration
): ResolvedPackage['resolveOptions']['additionalChangelogSourceFiles'] {
    return {
        packageFiles: packageConfiguration.additionalChangelogSourceFiles ?? [],
        sharedFiles: validated.packtoryConfiguration.commonPackageSettings?.additionalChangelogSourceFiles ?? []
    };
}

function releasePackageAdditionalPackageManifestAttributes(
    validated: ValidConfigurationResult,
    packageConfiguration: ReleasePackageConfiguration
): ResolvedPackage['resolveOptions']['additionalPackageManifestAttributes'] {
    return {
        ...validated.packtoryConfiguration.commonPackageSettings?.additionalPackageManifestAttributes,
        ...packageConfiguration.additionalPackageManifestAttributes
    };
}

function releasePackageResolveOptions(
    validated: ValidConfigurationResult,
    packageConfiguration: ReleasePackageConfiguration
): ResolvedPackage['resolveOptions'] {
    return {
        name: packageConfiguration.name,
        exportPackageManifest: packageConfiguration.exportPackageManifest,
        roots: packageConfiguration.roots,
        surface: undefined,
        sourcesFolder: releasePackageSourcesFolder(packageConfiguration),
        includeSourceMapFiles: packageConfiguration.includeSourceMapFiles ?? false,
        additionalFiles: packageConfiguration.additionalFiles ?? [],
        mainPackageManifest: releasePackageMainPackageManifest(validated, packageConfiguration),
        additionalChangelogSourceFiles: releasePackageAdditionalChangelogSourceFiles(validated, packageConfiguration),
        additionalPackageManifestAttributes: releasePackageAdditionalPackageManifestAttributes(
            validated,
            packageConfiguration
        ),
        allowMutableSpecifiers: [],
        deadCodeElimination: packageConfiguration.deadCodeElimination,
        bundleDependencies: [],
        bundlePeerDependencies: []
    };
}

export function resolvedPackagesFor(
    validated: ValidConfigurationResult,
    options: ResolvedPackagesOptions = {}
): readonly ResolvedPackage[] {
    return validated.packtoryConfiguration.packages.map(function (packageConfiguration) {
        const contents = resolvePackageContents(packageConfiguration.name, options);
        return {
            name: packageConfiguration.name,
            analyzedBundle: analyzedBundle({ name: packageConfiguration.name, contents }),
            resolveOptions: releasePackageResolveOptions(validated, packageConfiguration)
        };
    });
}
