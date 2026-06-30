import assert from 'node:assert';
import { Maybe } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { validateConfig, type ValidConfigResult } from '../config/validation.ts';
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

type PreviousReleaseArtifactsSpec = {
    readonly version: string;
    readonly publishedAt: Date;
    readonly gitHead?: string | undefined;
    readonly files: readonly ReleaseArtifactFile[];
};

type ResolvedPackagesOptions = {
    readonly bundleContents?: Readonly<Record<string, ResolvedPackage['analyzedBundle']['contents']>>;
    readonly defaultContents?: (packageName: string) => ResolvedPackage['analyzedBundle']['contents'];
};

type ReleasePackageConfig = ValidConfigResult['packtoryConfig']['packages'][number];

export type ReleaseTestDependencies = {
    readonly artifactsBuilder: { readonly collectContents: ReleaseFileCollection; };
    readonly fileManager: ReleasePlanFileReader;
    readonly packageProcessor: PackageProcessor;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly readCurrentGitHead: ReleaseCurrentGitHeadReader;
    readonly repositoryFolder: string;
    readonly scheduler: PackageScheduler;
};

type ReleaseTestDependencySpec = {
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

export function validatedReleaseConfigFor(packageNames: readonly string[]): ValidConfigResult {
    const result = validateConfig({
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        packages: packageNames.map(function (name) {
            return {
                mainPackageJson: { type: 'module' },
                name,
                publishSettings: { access: 'public' },
                roots: { main: { js: `source/${name}.js` } },
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
        async build() {
            throw new Error('build() should not be called in release tests');
        },
        async buildAndPublish() {
            throw new Error('buildAndPublish() should not be called in release dry runs');
        },
        async resolveAndLink() {
            throw new Error('resolveAndLink() should not be called in release tests');
        },
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
    const packageName = overrides.packageName ?? 'pkg-a';
    const version = overrides.version ?? '1.0.1';

    return {
        status: 'new-version',
        publication: noPublicationOutcome,
        bundle: versionedBundleWithManifest({
            name: packageName,
            version,
            packageJson: { name: packageName, version }
        }),
        extraFiles: [],
        previousReleaseArtifacts: Maybe.nothing(),
        ...overrides
    };
}

export function packageProcessorCheckingStage(expectedStage: boolean): PackageProcessor {
    return {
        async build() {
            throw new Error('build() should not be called in release tests');
        },
        async buildAndPublish() {
            throw new Error('buildAndPublish() should not be called in release dry runs');
        },
        async resolveAndLink() {
            throw new Error('resolveAndLink() should not be called in release tests');
        },
        async tryBuildAndPublish(options) {
            assert.strictEqual(options.stage, expectedStage);
            return buildResultFor();
        }
    };
}

export function previousReleaseArtifactsFor(
    spec: PreviousReleaseArtifactsSpec
): BuildAndPublishResult['previousReleaseArtifacts'] {
    return Maybe.just({
        version: spec.version,
        publishedAt: spec.publishedAt,
        gitHead: spec.gitHead,
        files: spec.files
    });
}

export function createReleaseTestDependencies(spec: ReleaseTestDependencySpec): ReleaseTestDependencies {
    return {
        artifactsBuilder: {
            collectContents: spec.collectContents ??
                function () {
                    return [];
                }
        },
        fileManager: spec.fileManager ?? defaultReleasePlanFileReader,
        packageProcessor: spec.packageProcessor ?? packageProcessorWith(spec.buildResults ?? []),
        progressBroadcaster: releaseProgressBroadcaster,
        async readCurrentGitHead() {
            return spec.currentGitHead;
        },
        repositoryFolder: spec.repositoryFolder ?? '/',
        scheduler: createIteratingScheduler(spec.packageNames)
    };
}

function resolvePackageContents(
    packageName: string,
    options: ResolvedPackagesOptions
): ResolvedPackage['analyzedBundle']['contents'] {
    return options.bundleContents?.[packageName] ?? options.defaultContents?.(packageName) ?? [];
}

function releasePackageSourcesFolder(packageConfig: ReleasePackageConfig): string {
    return packageConfig.sourcesFolder ?? 'source';
}

function releasePackageMainPackageJson(
    validated: ValidConfigResult,
    packageConfig: ReleasePackageConfig
): ResolvedPackage['resolveOptions']['mainPackageJson'] {
    return packageConfig.mainPackageJson ??
        validated.packtoryConfig.commonPackageSettings?.mainPackageJson ?? { type: 'module' };
}

function releasePackageAdditionalChangelogSourceFiles(
    validated: ValidConfigResult,
    packageConfig: ReleasePackageConfig
): readonly string[] {
    return [
        ...validated.packtoryConfig.commonPackageSettings?.additionalChangelogSourceFiles ?? [],
        ...packageConfig.additionalChangelogSourceFiles ?? []
    ];
}

function releasePackageResolveOptions(
    validated: ValidConfigResult,
    packageConfig: ReleasePackageConfig
): ResolvedPackage['resolveOptions'] {
    return {
        name: packageConfig.name,
        exportPackageJson: packageConfig.exportPackageJson,
        roots: packageConfig.roots,
        surface: undefined,
        sourcesFolder: releasePackageSourcesFolder(packageConfig),
        includeSourceMapFiles: packageConfig.includeSourceMapFiles ?? false,
        additionalFiles: packageConfig.additionalFiles ?? [],
        mainPackageJson: releasePackageMainPackageJson(validated, packageConfig),
        additionalChangelogSourceFiles: {
            packageFiles: releasePackageAdditionalChangelogSourceFiles(validated, packageConfig),
            sharedFiles: []
        },
        additionalPackageJsonAttributes: packageConfig.additionalPackageJsonAttributes ?? {},
        allowMutableSpecifiers: [],
        deadCodeElimination: packageConfig.deadCodeElimination,
        bundleDependencies: [],
        bundlePeerDependencies: []
    };
}

export function resolvedPackagesFor(
    validated: ValidConfigResult,
    options: ResolvedPackagesOptions = {}
): readonly ResolvedPackage[] {
    return validated.packtoryConfig.packages.map(function (packageConfig) {
        const contents = resolvePackageContents(packageConfig.name, options);
        return {
            name: packageConfig.name,
            analyzedBundle: analyzedBundle({ name: packageConfig.name, contents }),
            resolveOptions: releasePackageResolveOptions(validated, packageConfig)
        };
    });
}
