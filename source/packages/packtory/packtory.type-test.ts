import { describe, test, expect } from 'tstyche';
import type { Result } from 'true-myth';
import type { PublicationOutcome } from '../../bundle-emitter/publication-outcome.ts';
import type { MetadataAuthMode, PublishAuthStrategy } from '../../config/registry-settings.ts';
import {
    progressBroadcastConsumer,
    type BuildAndPublishAllOptions,
    type buildAndPublishAll,
    type planReleaseAgainstLatestPublished,
    type ResolveAndLinkAllOptions,
    type resolveAndLinkAll,
    type BuildReport,
    type PacktoryConfig,
    type PublishAllOutcome,
    type PublishAllResult,
    type ReleasePlan,
    type ReleasePlanOutcome,
    type ReleasePlanPackage,
    type ReleasePlanRegistryMetadata,
    type ReleasePlanResult,
    type ResolveAndLinkAllOutcome,
    type ResolveAndLinkAllResult,
    type ResolveAndLinkFailure,
    type ResolvedPackage,
    type VersionProviderInput
} from './packtory.entry-point.ts';

type ProgressListener = (payload: unknown) => void;
declare const progressListener: ProgressListener;
type BuildAndPublishAllFunction = (
    config: unknown,
    options: BuildAndPublishAllOptions
) => Promise<PublishAllOutcome>;
type ResolveAndLinkAllFunction = (
    config: unknown,
    options?: ResolveAndLinkAllOptions
) => Promise<ResolveAndLinkAllOutcome>;
type PlanReleaseAgainstLatestPublishedFunction = (config: unknown) => Promise<ReleasePlanOutcome>;

type PackageConfig = PacktoryConfig['packages'][number];
type ChangelogSettings = NonNullable<PacktoryConfig['changelog']>;
type Root = PackageConfig['roots'][string];
type ConfigWithVersioning<TVersioning> = {
    readonly registrySettings: {
        readonly auth: { readonly type: 'bearer-token'; readonly token: 'any-token'; };
    };
    readonly packages: readonly [
        {
            readonly name: 'pkg';
            readonly roots: { readonly main: { readonly js: 'index.js'; }; };
            readonly versioning: TVersioning;
        }
    ];
};
type OkVariant<TResult> = Extract<TResult, { readonly isOk: true; }>;
type ErrVariant<TResult> = Extract<TResult, { readonly isErr: true; }>;
type PublishOk = OkVariant<PublishAllResult>['value'];
type PublishErr = ErrVariant<PublishAllResult>['error'];
type BuildAndPublishResult = PublishOk[number];
type ReleasePlanOk = OkVariant<ReleasePlanResult>['value'];
type ReleasePlanErr = ErrVariant<ReleasePlanResult>['error'];
type ResultFailureType = 'checks' | 'config' | 'partial';
type ReleasePlanArtifactState = 'changed' | 'first-publish' | 'unchanged';

describe('public functions', function () {
    test('buildAndPublishAll takes an unknown config and build options and returns a PublishAllOutcome', function () {
        expect<typeof buildAndPublishAll>().type.toBe<BuildAndPublishAllFunction>();
    });

    test('resolveAndLinkAll takes an unknown config and returns a ResolveAndLinkAllOutcome', function () {
        expect<typeof resolveAndLinkAll>().type.toBe<ResolveAndLinkAllFunction>();
    });

    test('planReleaseAgainstLatestPublished takes an unknown config and returns a ReleasePlanOutcome', function () {
        expect<typeof planReleaseAgainstLatestPublished>().type.toBe<PlanReleaseAgainstLatestPublishedFunction>();
    });
});

describe('PublishAllOutcome', function () {
    test('exposes the wrapped result', function () {
        expect<PublishAllOutcome['result']>().type.toBe<PublishAllResult>();
    });

    test('exposes a getReport method that returns BuildReport or undefined', function () {
        expect<PublishAllOutcome['getReport']>().type.toBe<() => BuildReport | undefined>();
    });
});

describe('ResolveAndLinkAllOutcome', function () {
    test('exposes the wrapped result', function () {
        expect<ResolveAndLinkAllOutcome['result']>().type.toBe<ResolveAndLinkAllResult>();
    });

    test('exposes a getReport method that returns BuildReport or undefined', function () {
        expect<ResolveAndLinkAllOutcome['getReport']>().type.toBe<() => BuildReport | undefined>();
    });
});

describe('ReleasePlanOutcome', function () {
    test('exposes the wrapped result', function () {
        expect<ReleasePlanOutcome['result']>().type.toBe<ReleasePlanResult>();
    });

    test('exposes a getReport method that returns BuildReport', function () {
        expect<ReleasePlanOutcome['getReport']>().type.toBe<() => BuildReport>();
    });
});

describe('progressBroadcastConsumer', function () {
    test('on accepts the documented event names', function () {
        progressBroadcastConsumer.on('building', progressListener);
        progressBroadcastConsumer.on('done', progressListener);
        progressBroadcastConsumer.on('error', progressListener);
        progressBroadcastConsumer.on('linking', progressListener);
        progressBroadcastConsumer.on('publishing', progressListener);
        progressBroadcastConsumer.on('rebuilding', progressListener);
        progressBroadcastConsumer.on('resolving', progressListener);
        progressBroadcastConsumer.on('scheduled', progressListener);
    });

    test('off accepts the documented event names', function () {
        progressBroadcastConsumer.off('building', progressListener);
        progressBroadcastConsumer.off('done', progressListener);
        progressBroadcastConsumer.off('error', progressListener);
        progressBroadcastConsumer.off('linking', progressListener);
        progressBroadcastConsumer.off('publishing', progressListener);
        progressBroadcastConsumer.off('rebuilding', progressListener);
        progressBroadcastConsumer.off('resolving', progressListener);
        progressBroadcastConsumer.off('scheduled', progressListener);
    });

    test('exposes only on and off', function () {
        expect<keyof typeof progressBroadcastConsumer>().type.toBe<'off' | 'on'>();
    });
});

describe('PacktoryConfig — accepted shapes', function () {
    test('accepts a minimum valid configuration (registrySettings and packages)', function () {
        expect<PacktoryConfig>().type.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly auth: { readonly type: 'bearer-token'; readonly token: 'any-token'; };
            };
            readonly packages: readonly [
                { readonly name: 'pkg'; readonly roots: { readonly main: { readonly js: 'index.js'; }; }; }
            ];
        }>();
    });

    test('accepts a fully populated configuration with all optional fields', function () {
        expect<PacktoryConfig>().type.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly registryUrl: 'https://registry.example';
                readonly auth: {
                    readonly publish: {
                        readonly type: 'basic';
                        readonly username: 'user';
                        readonly password: 'secret';
                    };
                    readonly metadata: 'auto';
                };
            };
            readonly checks: { readonly noDuplicatedFiles: { readonly enabled: true; }; };
            readonly changelog: {
                readonly explicitBaseRef: 'main';
                readonly labels: { readonly operations: 'Operations'; };
                readonly outputs: readonly [
                    { readonly kind: 'repository-file'; readonly path: 'CHANGELOG.md'; },
                    {
                        readonly kind: 'package-file';
                        readonly paths: { readonly pkg: 'packages/pkg/CHANGELOG.md'; };
                    }
                ];
                readonly packageTagFormat: 'pkg/{packageName}/v{version}';
                readonly targetScopedLabelPattern: 'scope:{targetName}:{label}';
            };
            readonly commonPackageSettings: { readonly sourcesFolder: 'src'; readonly includeSourceMapFiles: true; };
            readonly packages: readonly [
                {
                    readonly name: 'pkg';
                    readonly roots: {
                        readonly main: {
                            readonly js: 'index.js';
                            readonly declarationFile: 'index.d.ts';
                        };
                    };
                    readonly bundleDependencies: readonly ['effect'];
                    readonly bundlePeerDependencies: readonly ['react'];
                    readonly includeSourceMapFiles: false;
                }
            ];
        }>();
    });

    test('accepts provider manual versioning', function () {
        expect<PacktoryConfig>().type.toBeAssignableFrom<
            ConfigWithVersioning<{
                readonly automatic: false;
                readonly provideVersion: (input: VersionProviderInput) => Promise<string>;
            }>
        >();
    });

    test('accepts source manual versioning', function () {
        expect<PacktoryConfig>().type.toBeAssignableFrom<
            ConfigWithVersioning<{
                readonly automatic: false;
                readonly source: 'pull-request-labels';
            }>
        >();
    });
});

describe('PacktoryConfig — rejected shapes', function () {
    test('accepts a configuration without registrySettings (read-only ops do not require auth)', function () {
        expect<{
            readonly packages: readonly [{ readonly name: 'pkg'; readonly roots: Readonly<Record<string, never>>; }];
        }>()
            .type
            .toBeAssignableTo<PacktoryConfig>();
    });

    test('rejects a configuration without packages', function () {
        expect<PacktoryConfig>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly auth: { readonly type: 'bearer-token'; readonly token: 'tok'; };
            };
        }>();
    });

    test('accepts a registrySettings without auth (publish fails fast at runtime instead)', function () {
        expect<{
            readonly registrySettings: { readonly registryUrl: 'https://registry.example'; };
            readonly packages: readonly [{ readonly name: 'pkg'; readonly roots: Readonly<Record<string, never>>; }];
        }>()
            .type
            .toBeAssignableTo<PacktoryConfig>();
    });

    test('rejects a package without name or roots', function () {
        expect<PacktoryConfig>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly auth: { readonly type: 'bearer-token'; readonly token: 'tok'; };
            };
            readonly packages: readonly [{ readonly roots: { readonly main: { readonly js: 'index.js'; }; }; }];
        }>();
        expect<PacktoryConfig>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly auth: { readonly type: 'bearer-token'; readonly token: 'tok'; };
            };
            readonly packages: readonly [{ readonly name: 'pkg'; }];
        }>();
    });
});

describe('PacktoryConfig — exposed structure', function () {
    test('exposes the documented top-level keys', function () {
        expect<keyof PacktoryConfig>().type.toBe<
            'changelog' | 'checks' | 'commonPackageSettings' | 'packages' | 'registrySettings'
        >();
    });

    test('packages is a readonly array', function () {
        expect<PacktoryConfig['packages']>().type.toBe<readonly PackageConfig[]>();
    });

    test('registrySettings exposes the documented auth fields', function () {
        type RequiredRegistrySettings = NonNullable<PacktoryConfig['registrySettings']>;
        expect<RequiredRegistrySettings['registryUrl']>().type.toBe<string | undefined>();
        type ExpandedAuth = Extract<RequiredRegistrySettings['auth'], { readonly publish: unknown; }>;
        expect<ExpandedAuth['publish']>().type.toBe<PublishAuthStrategy>();
        expect<ExpandedAuth['metadata']>().type.toBe<MetadataAuthMode | undefined>();
    });

    test('registrySettings is optional on PacktoryConfig', function () {
        expect<PacktoryConfig['registrySettings']>().type.toBe<
            NonNullable<PacktoryConfig['registrySettings']> | undefined
        >();
    });

    test('PackageConfig requires name and roots', function () {
        expect<PackageConfig['name']>().type.toBe<string>();
        expect<PackageConfig['roots']>().type.toBe<Readonly<Record<string, Root>>>();
    });

    test('Root requires a js path and allows an optional declarationFile', function () {
        expect<Root['js']>().type.toBe<string>();
        expect<Root['declarationFile']>().type.toBe<string | undefined>();
    });

    test('checks.noDuplicatedFiles is toggled at the top level via `enabled`', function () {
        type Checks = NonNullable<PacktoryConfig['checks']>;
        type NoDuplicates = NonNullable<Checks['noDuplicatedFiles']>;
        expect<NoDuplicates['enabled']>().type.toBe<boolean>();
    });

    test('checks.areTheTypesWrong is toggled at the top level via `enabled`', function () {
        type Checks = NonNullable<PacktoryConfig['checks']>;
        type AreTheTypesWrong = NonNullable<Checks['areTheTypesWrong']>;
        expect<AreTheTypesWrong['enabled']>().type.toBe<boolean>();
    });

    test('PackageConfig.checks.noDuplicatedFiles carries the per-package allowList', function () {
        type PackageChecks = NonNullable<PackageConfig['checks']>;
        type NoDuplicates = NonNullable<PackageChecks['noDuplicatedFiles']>;
        expect<NoDuplicates['allowList']>().type.toBe<readonly string[] | undefined>();
    });

    test('PackageConfig.checks.areTheTypesWrong carries the per-package profile override', function () {
        type PackageChecks = NonNullable<PackageConfig['checks']>;
        type AreTheTypesWrong = NonNullable<PackageChecks['areTheTypesWrong']>;
        expect<AreTheTypesWrong['profile']>().type.toBe<'esm-only' | 'node16' | 'strict' | undefined>();
    });
});

describe('VersionProviderInput', function () {
    test('exposes package attribution inputs', function () {
        expect<VersionProviderInput['packageName']>().type.toBe<string>();
        expect<VersionProviderInput['currentVersion']>().type.toBe<string | undefined>();
        expect<VersionProviderInput['targetSourceFiles']>().type.toBe<readonly string[]>();
        expect<VersionProviderInput['ignoredAttributionPaths']>().type.toBe<readonly string[]>();
        expect<VersionProviderInput['registrySettings']>().type.toBe<NonNullable<PacktoryConfig['registrySettings']>>();
        expect<VersionProviderInput['stage']>().type.toBe<boolean>();
    });
});

describe('PacktoryConfig changelog structure', function () {
    test('changelog exposes generation and output settings', function () {
        expect<ChangelogSettings['explicitBaseRef']>().type.toBe<string | undefined>();
        expect<ChangelogSettings['labels']>().type.toBe<Readonly<Record<string, string>> | undefined>();
        expect<ChangelogSettings['outputs']>().type.toBeAssignableTo<readonly unknown[] | undefined>();
        expect<ChangelogSettings['packageTagFormat']>().type.toBe<string | undefined>();
        expect<ChangelogSettings['targetScopedLabelPattern']>().type.toBe<string | undefined>();
    });
});

describe('PublishAllResult', function () {
    test('is a true-myth Result whose ok value is a readonly array', function () {
        expect<PublishAllResult>().type.toBeAssignableTo<Result<readonly unknown[], unknown>>();
    });

    test('the ok value is a readonly array of build-and-publish results', function () {
        expect<PublishOk>().type.toBe<readonly BuildAndPublishResult[]>();
    });

    test('each result element exposes status and bundle', function () {
        expect<BuildAndPublishResult>().type.toHaveProperty('status');
        expect<BuildAndPublishResult>().type.toHaveProperty('bundle');
        expect<BuildAndPublishResult>().type.toHaveProperty('publication');
    });

    test('the status field is a fixed string union', function () {
        expect<BuildAndPublishResult['status']>().type.toBe<'already-published' | 'initial-version' | 'new-version'>();
    });

    test('the publication field captures whether the package was published, staged, or skipped', function () {
        expect<BuildAndPublishResult['publication']>().type.toBe<PublicationOutcome>();
    });

    test('the failure variant is a discriminated union keyed by `type`', function () {
        expect<PublishErr['type']>().type.toBe<ResultFailureType>();
    });

    test('a checks failure exposes a readonly issues array of strings', function () {
        type ChecksFailure = Extract<PublishErr, { readonly type: 'checks'; }>;
        expect<ChecksFailure['issues']>().type.toBe<readonly string[]>();
    });

    test('a config failure exposes a readonly issues array of strings', function () {
        type ConfigFailure = Extract<PublishErr, { readonly type: 'config'; }>;
        expect<ConfigFailure['issues']>().type.toBe<readonly string[]>();
    });

    test('a partial failure carries succeeded results and a list of errors', function () {
        type PartialFailure = Extract<PublishErr, { readonly type: 'partial'; }>;
        expect<PartialFailure['succeeded']>().type.toBe<readonly BuildAndPublishResult[]>();
        expect<PartialFailure['failures']>().type.toBe<readonly Error[]>();
    });
});

describe('ResolveAndLinkAllResult', function () {
    test('is a Result of readonly ResolvedPackage entries with ResolveAndLinkFailure', function () {
        expect<ResolveAndLinkAllResult>().type.toBe<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>();
    });

    test('the failure variant is a discriminated union keyed by `type`', function () {
        expect<ResolveAndLinkFailure['type']>().type.toBe<ResultFailureType>();
    });
});

describe('ReleasePlanResult', function () {
    test('is a Result of a release plan with a discriminated failure union', function () {
        expect<ReleasePlanResult>().type.toBe<Result<ReleasePlan, ReleasePlanErr>>();
        expect<ReleasePlanErr['type']>().type.toBe<ResultFailureType>();
    });

    test('the ok value exposes release-plan packages', function () {
        expect<ReleasePlanOk['packages']>().type.toBe<readonly ReleasePlanPackage[]>();
    });

    test('each package exposes planned versions, artifacts, and registry metadata', function () {
        expect<ReleasePlanPackage['name']>().type.toBe<string>();
        expect<ReleasePlanPackage['previousVersion']>().type.toBe<string | undefined>();
        expect<ReleasePlanPackage['nextVersion']>().type.toBe<string>();
        expect<ReleasePlanPackage['artifactState']>().type.toBe<ReleasePlanArtifactState>();
        expect<ReleasePlanPackage['changed']>().type.toBe<boolean>();
        expect<ReleasePlanPackage['previousGitHead']>().type.toBe<string | undefined>();
        expect<ReleasePlanPackage['currentGitHead']>().type.toBe<string | undefined>();
        expect<ReleasePlanPackage['latestRegistryMetadata']>().type.toBe<ReleasePlanRegistryMetadata | undefined>();
    });

    test('each package exposes artifact and source file lists', function () {
        expect<ReleasePlanPackage['artifactFiles']>().type.toBe<readonly string[]>();
        expect<ReleasePlanPackage['changedArtifactFiles']>().type.toBe<readonly string[]>();
        expect<ReleasePlanPackage['sourceFiles']>().type.toBe<readonly string[]>();
        expect<ReleasePlanPackage['changelogDependencyNames']>().type.toBe<readonly string[]>();
        expect<ReleasePlanPackage['changelogSourceFiles']>().type.toBe<readonly string[]>();
    });

    test('registry metadata exposes the latest version, publish date, and git head', function () {
        expect<ReleasePlanRegistryMetadata['version']>().type.toBe<string>();
        expect<ReleasePlanRegistryMetadata['publishedAt']>().type.toBe<Date | undefined>();
        expect<ReleasePlanRegistryMetadata['gitHead']>().type.toBe<string | undefined>();
    });

    test('a partial failure carries succeeded package plans and a list of errors', function () {
        type PartialFailure = Extract<ReleasePlanErr, { readonly type: 'partial'; }>;
        expect<PartialFailure['succeeded']>().type.toBe<readonly ReleasePlanPackage[]>();
        expect<PartialFailure['failures']>().type.toBe<readonly Error[]>();
    });
});

describe('ResolvedPackage', function () {
    test('exposes name, analyzedBundle, and resolveOptions', function () {
        expect<ResolvedPackage>().type.toHaveProperty('name');
        expect<ResolvedPackage>().type.toHaveProperty('analyzedBundle');
        expect<ResolvedPackage>().type.toHaveProperty('resolveOptions');
        expect<ResolvedPackage['name']>().type.toBe<string>();
    });
});
