import assert from 'node:assert';
import { Maybe } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { validateConfig, type ValidConfigResult } from '../config/validation.ts';
import type { ProgressBroadcaster } from '../packtory/packtory-results.ts';
import type { BuildAndPublishResult, PackageProcessor } from '../packtory/package-processor.ts';
import type { ResolvedPackage } from '../packtory/resolved-package.ts';
import { analyzedBundle, versionedBundleWithManifest } from './bundle-fixtures.ts';
import { createIteratingScheduler } from './iterating-scheduler.ts';

export type ReleaseFileCollection = ArtifactsBuilder['collectContents'];

type ReleaseArtifactFile = {
    readonly content: string;
    readonly filePath: string;
    readonly isExecutable: boolean;
};

export type ReleaseTestDependencies = {
    readonly artifactsBuilder: { readonly collectContents: ReleaseFileCollection };
    readonly packageProcessor: PackageProcessor;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly scheduler: ReturnType<typeof createIteratingScheduler>;
};

type ReleaseTestDependencySpec = {
    readonly packageNames: readonly string[];
    readonly buildResults?: readonly BuildAndPublishResult[];
    readonly collectContents?: ReleaseFileCollection;
    readonly packageProcessor?: PackageProcessor;
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

export function validatedReleaseConfigFor(packageNames: readonly string[]): ValidConfigResult {
    const result = validateConfig({
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        packages: packageNames.map((name) => {
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
    return packageProcessorFor(buildResults, () => {
        throw new Error('Missing build result fixture');
    });
}

export function packageProcessorWithFailure(
    buildResults: readonly BuildAndPublishResult[],
    failure: Error
): PackageProcessor {
    return packageProcessorFor(buildResults, () => {
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

export function previousReleaseArtifactsFor(spec: {
    readonly version: string;
    readonly publishedAt: Date;
    readonly files: readonly ReleaseArtifactFile[];
}): BuildAndPublishResult['previousReleaseArtifacts'] {
    return Maybe.just({
        version: spec.version,
        publishedAt: spec.publishedAt,
        files: spec.files
    });
}

export function createReleaseTestDependencies(spec: ReleaseTestDependencySpec): ReleaseTestDependencies {
    return {
        artifactsBuilder: {
            collectContents:
                spec.collectContents ??
                (() => {
                    return [];
                })
        },
        packageProcessor: spec.packageProcessor ?? packageProcessorWith(spec.buildResults ?? []),
        progressBroadcaster: releaseProgressBroadcaster,
        scheduler: createIteratingScheduler(spec.packageNames)
    };
}

export function resolvedPackagesFor(
    validated: ValidConfigResult,
    options: {
        readonly bundleContents?: Readonly<Record<string, ReturnType<typeof analyzedBundle>['contents']>>;
        readonly defaultContents?: (packageName: string) => ReturnType<typeof analyzedBundle>['contents'];
    } = {}
): readonly ResolvedPackage[] {
    return validated.packtoryConfig.packages.map((packageConfig) => {
        const contents =
            options.bundleContents?.[packageConfig.name] ?? options.defaultContents?.(packageConfig.name) ?? [];
        return {
            name: packageConfig.name,
            analyzedBundle: analyzedBundle({ name: packageConfig.name, contents }),
            resolveOptions: {
                name: packageConfig.name,
                exportPackageJson: packageConfig.exportPackageJson,
                roots: packageConfig.roots,
                surface: undefined,
                sourcesFolder: packageConfig.sourcesFolder ?? 'source',
                includeSourceMapFiles: packageConfig.includeSourceMapFiles ?? false,
                additionalFiles: packageConfig.additionalFiles ?? [],
                mainPackageJson: packageConfig.mainPackageJson ?? { type: 'module' },
                additionalPackageJsonAttributes: packageConfig.additionalPackageJsonAttributes ?? {},
                allowMutableSpecifiers: [],
                deadCodeElimination: packageConfig.deadCodeElimination,
                bundleDependencies: [],
                bundlePeerDependencies: []
            }
        };
    });
}
