import type { Result } from 'true-myth';
import { describe, expect, test } from 'tstyche';
import type { PublicationOutcome } from '../../bundle-emitter/publication-outcome.ts';
import type {
    MetadataAuthenticationMode,
    PublishAuthenticationStrategy
} from '../../configuration/registry-settings.ts';
import {
    progressListener,
    type BuildAndPublishAllFunction,
    type BuildAndPublishResult,
    type ChangelogSettings,
    type ConfigurationWithVersioning,
    type InspectPackageDependenciesFunction,
    type LabelLookupIntervalMilliseconds,
    type MaximumRateLimitRetryCount,
    type PackageConfiguration,
    type PackageDependencyManifestState,
    type PackageDependencyOrigin,
    type PackAllPackagesFunction,
    type PlanReleaseAgainstLatestPublishedFunction,
    type PublishError,
    type PublishOk,
    type ReleasePlanArtifactState,
    type ReleasePlanError,
    type ReleasePlanOk,
    type ResolveAndLinkAllFunction,
    type ResultFailureType,
    type Root
} from '../../test-libraries/public-package-api-expectations.ts';
import {
    progressBroadcastConsumer,
    type buildAndPublishAll,
    type BuildReport,
    type inspectPackageDependencies,
    type PackageDependencyInspection,
    type PackageDependencyInspectionOutcome,
    type PackageDependencyInspectionResult,
    type PackAllOutcome,
    type packAllPackages,
    type PackAllPublicOptions,
    type PackAllResult,
    type PacktoryConfiguration,
    type planReleaseAgainstLatestPublished,
    type PublishAllOutcome,
    type PublishAllResult,
    type ReleasePlan,
    type ReleasePlanOutcome,
    type ReleasePlanPackage,
    type ReleasePlanRegistryMetadata,
    type ReleasePlanResult,
    type resolveAndLinkAll,
    type ResolveAndLinkAllOutcome,
    type ResolveAndLinkAllResult,
    type ResolveAndLinkFailure,
    type ResolvedPackage,
    type VersionProviderInput
} from './packtory.entry-point.ts';

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

    test('packAllPackages takes an unknown config and returns a PackAllOutcome', function () {
        expect<typeof packAllPackages>().type.toBe<PackAllPackagesFunction>();
    });

    test(
        'inspectPackageDependencies takes an unknown config and package name and returns an inspection outcome',
        function () {
            expect<typeof inspectPackageDependencies>().type.toBe<InspectPackageDependenciesFunction>();
        }
    );
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

describe('PackAllOutcome', function () {
    test('exposes the wrapped result', function () {
        expect<PackAllOutcome['result']>().type.toBe<PackAllResult>();
    });

    test('returns the packed package names on success', function () {
        expect<Extract<PackAllResult, { readonly isOk: true; }>['value']>().type.toBe<{
            readonly packageNames: readonly string[];
        }>();
    });

    test('accepts folder output options without a format property', function () {
        expect<PackAllPublicOptions>().type.toBeAssignableFrom<{
            readonly outputPath: '/out';
            readonly version: '1.0.0';
            readonly vendorDependencies: false;
        }>();
        expect<keyof PackAllPublicOptions>().type.toBe<'outputPath' | 'vendorDependencies' | 'version'>();
    });
});

describe('PackageDependencyInspectionOutcome', function () {
    test('exposes the wrapped result', function () {
        expect<PackageDependencyInspectionOutcome['result']>().type.toBe<PackageDependencyInspectionResult>();
    });

    test('the ok value exposes dependency reasons for one package', function () {
        type Dependency = PackageDependencyInspection['dependencies'][number];
        type Reference = Dependency['references'][number];
        expect<PackageDependencyInspection['packageName']>().type.toBe<string>();
        expect<Dependency['name']>().type.toBe<string>();
        expect<Dependency['origin']>().type.toBe<PackageDependencyOrigin>();
        expect<Dependency['manifest']['type']>().type.toBe<PackageDependencyManifestState>();
        expect<Reference['sourcePath']>().type.toBe<string>();
        expect<Reference['sourceSpecifier']>().type.toBe<string>();
        expect<Reference['emittedSpecifier']>().type.toBe<string>();
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

describe('PacktoryConfiguration - accepted shapes', function () {
    test('accepts a minimum valid configuration (registrySettings and packages)', function () {
        expect<PacktoryConfiguration>().type.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly authentication: { readonly type: 'bearer-token'; readonly token: 'any-token'; };
            };
            readonly packages: readonly [
                {
                    readonly name: 'package-a';
                    readonly roots: { readonly main: { readonly javaScript: 'index.js'; }; };
                }
            ];
        }>();
    });

    test('accepts a fully populated configuration with all optional fields', function () {
        expect<PacktoryConfiguration>().type.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly registryAddress: 'https://registry.example';
                readonly authentication: {
                    readonly publish: {
                        readonly type: 'basic';
                        readonly username: 'user';
                        readonly password: 'secret';
                    };
                    readonly metadata: 'automatic';
                };
            };
            readonly checks: {
                readonly noDuplicatedFiles: { readonly enabled: true; };
                readonly noUnexposedExecutables: { readonly enabled: true; };
            };
            readonly changelog: {
                readonly explicitBaseReference: 'main';
                readonly pullRequestLog: {
                    readonly validLabels: { readonly operations: 'Operations'; };
                    readonly ignoredLabels: readonly ['skip-changelog'];
                    readonly versionBumps: { readonly patch: readonly ['operations']; };
                    readonly dateFormat: 'yyyy-MM-dd';
                    readonly collapseRules: readonly [
                        {
                            readonly label: 'operations';
                            readonly pattern: '^Update (?<dependency>.+?) from (?<from>.+?) to (?<to>.+?)$';
                            readonly replace: 'Update $<dependency> from $<from> to $<to>';
                        },
                        {
                            readonly label: 'operations';
                            readonly pattern: '^Update (?<dependency>.+?) to (?<to>.+?)$';
                            readonly replace: 'Update $<dependency> to $<to>';
                            readonly versionGroup: 'to';
                        },
                        {
                            readonly label: 'operations';
                            readonly pattern: '^Update (?<dependency>.+?)$';
                            readonly replace: 'Update $<dependency>';
                            readonly collapse: 'same';
                        }
                    ];
                    readonly labelLookupIntervalMilliseconds: LabelLookupIntervalMilliseconds;
                    readonly maximumRateLimitRetryCount: MaximumRateLimitRetryCount;
                };
                readonly outputs: readonly [
                    { readonly kind: 'repository-file'; readonly path: 'CHANGELOG.md'; },
                    {
                        readonly kind: 'package-file';
                        readonly paths: { readonly 'package-a': 'packages/package-a/CHANGELOG.md'; };
                    }
                ];
                readonly packageTagFormat: 'package/{packageName}/v{version}';
                readonly targetScopedLabelPattern: 'scope:{targetName}:{label}';
            };
            readonly commonPackageSettings: { readonly sourcesFolder: 'source'; readonly includeSourceMapFiles: true; };
            readonly packages: readonly [
                {
                    readonly name: 'package-a';
                    readonly roots: {
                        readonly main: {
                            readonly javaScript: 'index.js';
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
        expect<PacktoryConfiguration>().type.toBeAssignableFrom<
            ConfigurationWithVersioning<{
                readonly automatic: false;
                readonly provideVersion: (input: VersionProviderInput) => Promise<string>;
            }>
        >();
    });

    test('accepts source manual versioning', function () {
        expect<PacktoryConfiguration>().type.toBeAssignableFrom<
            ConfigurationWithVersioning<{
                readonly automatic: false;
                readonly source: 'pull-request-labels';
            }>
        >();
    });
});

describe('PacktoryConfiguration - rejected shapes', function () {
    test('accepts a configuration without registrySettings (read-only ops do not require auth)', function () {
        expect<{
            readonly packages: readonly [
                { readonly name: 'package-a'; readonly roots: Readonly<Record<string, never>>; }
            ];
        }>()
            .type
            .toBeAssignableTo<PacktoryConfiguration>();
    });

    test('rejects a configuration without packages', function () {
        expect<PacktoryConfiguration>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly authentication: { readonly type: 'bearer-token'; readonly token: 'tok'; };
            };
        }>();
    });

    test('accepts a registrySettings without auth (publish fails fast at runtime instead)', function () {
        expect<{
            readonly registrySettings: { readonly registryAddress: 'https://registry.example'; };
            readonly packages: readonly [
                { readonly name: 'package-a'; readonly roots: Readonly<Record<string, never>>; }
            ];
        }>()
            .type
            .toBeAssignableTo<PacktoryConfiguration>();
    });

    test('rejects a package without name or roots', function () {
        expect<PacktoryConfiguration>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly authentication: { readonly type: 'bearer-token'; readonly token: 'tok'; };
            };
            readonly packages: readonly [{ readonly roots: { readonly main: { readonly javaScript: 'index.js'; }; }; }];
        }>();
        expect<PacktoryConfiguration>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly authentication: { readonly type: 'bearer-token'; readonly token: 'tok'; };
            };
            readonly packages: readonly [{ readonly name: 'package-a'; }];
        }>();
    });
});

describe('PacktoryConfiguration - exposed structure', function () {
    test('exposes the documented top-level keys', function () {
        expect<keyof PacktoryConfiguration>().type.toBe<
            'changelog' | 'checks' | 'commonPackageSettings' | 'packages' | 'registrySettings'
        >();
    });

    test('packages is a readonly array', function () {
        expect<PacktoryConfiguration['packages']>().type.toBe<readonly PackageConfiguration[]>();
    });

    test('registrySettings exposes the documented auth fields', function () {
        type RequiredRegistrySettings = NonNullable<PacktoryConfiguration['registrySettings']>;
        expect<RequiredRegistrySettings['registryAddress']>().type.toBe<string | undefined>();
        type ExpandedAuthentication = Extract<
            RequiredRegistrySettings['authentication'],
            { readonly publish: unknown; }
        >;
        expect<ExpandedAuthentication['publish']>().type.toBe<PublishAuthenticationStrategy>();
        expect<ExpandedAuthentication['metadata']>().type.toBe<MetadataAuthenticationMode | undefined>();
    });

    test('registrySettings is optional on PacktoryConfiguration', function () {
        expect<PacktoryConfiguration['registrySettings']>().type.toBe<
            NonNullable<PacktoryConfiguration['registrySettings']> | undefined
        >();
    });

    test('PackageConfiguration requires name and roots', function () {
        expect<PackageConfiguration['name']>().type.toBe<string>();
        expect<PackageConfiguration['roots']>().type.toBe<Readonly<Record<string, Root>>>();
    });

    test('Root requires a js path and allows an optional declarationFile', function () {
        expect<Root['javaScript']>().type.toBe<string>();
        expect<Root['declarationFile']>().type.toBe<string | undefined>();
    });

    test('checks.noDuplicatedFiles is toggled at the top level via `enabled`', function () {
        type Checks = NonNullable<PacktoryConfiguration['checks']>;
        type NoDuplicates = NonNullable<Checks['noDuplicatedFiles']>;
        expect<NoDuplicates['enabled']>().type.toBe<boolean>();
    });

    test('checks.typeScriptIntegrity is toggled at the top level via `enabled`', function () {
        type Checks = NonNullable<PacktoryConfiguration['checks']>;
        type TypeScriptIntegrity = NonNullable<Checks['typeScriptIntegrity']>;
        expect<TypeScriptIntegrity['enabled']>().type.toBe<boolean>();
        expect<TypeScriptIntegrity['declarations']>().type.toBe<'all' | 'exports-graph' | undefined>();
    });

    test('PackageConfiguration.checks.noDuplicatedFiles carries the per-package allowList', function () {
        type PackageChecks = NonNullable<PackageConfiguration['checks']>;
        type NoDuplicates = NonNullable<PackageChecks['noDuplicatedFiles']>;
        expect<NoDuplicates['allowList']>().type.toBe<readonly string[] | undefined>();
    });

    test('PackageConfiguration.checks.typeScriptIntegrity accepts no per-package options', function () {
        type PackageChecks = NonNullable<PackageConfiguration['checks']>;
        type TypeScriptIntegrity = NonNullable<PackageChecks['typeScriptIntegrity']>;
        expect<TypeScriptIntegrity>().type.toBe<Readonly<Record<string, never>>>();
    });
});

describe('PacktoryConfiguration checks', function () {
    test('checks.noUnexposedExecutables is toggled at the top level via `enabled`', function () {
        type Checks = NonNullable<PacktoryConfiguration['checks']>;
        type NoUnexposedExecutables = NonNullable<Checks['noUnexposedExecutables']>;
        expect<NoUnexposedExecutables['enabled']>().type.toBe<boolean>();
    });
});

describe('VersionProviderInput', function () {
    test('exposes package attribution inputs', function () {
        expect<VersionProviderInput['packageName']>().type.toBe<string>();
        expect<VersionProviderInput['currentVersion']>().type.toBe<string | undefined>();
        expect<VersionProviderInput['targetSourceFiles']>().type.toBe<readonly string[]>();
        expect<VersionProviderInput['ignoredAttributionPaths']>().type.toBe<readonly string[]>();
        expect<VersionProviderInput['registrySettings']>().type.toBe<
            NonNullable<PacktoryConfiguration['registrySettings']>
        >();
        expect<VersionProviderInput['stage']>().type.toBe<boolean>();
    });
});

describe('PacktoryConfiguration changelog structure', function () {
    test('changelog exposes generation and output settings', function () {
        expect<ChangelogSettings['explicitBaseReference']>().type.toBe<string | undefined>();
        expect<NonNullable<ChangelogSettings['pullRequestLog']>['validLabels']>().type.toBe<
            Readonly<Record<string, string>> | undefined
        >();
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
        expect<PublishError['type']>().type.toBe<ResultFailureType>();
    });

    test('a checks failure exposes a readonly issues array of strings', function () {
        type ChecksFailure = Extract<PublishError, { readonly type: 'checks'; }>;
        expect<ChecksFailure['issues']>().type.toBe<readonly string[]>();
    });

    test('a config failure exposes a readonly issues array of strings', function () {
        type ConfigurationFailure = Extract<PublishError, { readonly type: 'configuration'; }>;
        expect<ConfigurationFailure['issues']>().type.toBe<readonly string[]>();
    });

    test('a partial failure carries succeeded results and a list of errors', function () {
        type PartialFailure = Extract<PublishError, { readonly type: 'partial'; }>;
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
        expect<ReleasePlanResult>().type.toBe<Result<ReleasePlan, ReleasePlanError>>();
        expect<ReleasePlanError['type']>().type.toBe<ResultFailureType>();
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
        expect<ReleasePlanPackage['changelogDependencyUpdates']>().type.toBe<
            readonly { readonly name: string; readonly version: string; }[]
        >();
        expect<ReleasePlanPackage['changelogSourceFiles']>().type.toBe<readonly string[]>();
    });

    test('registry metadata exposes the latest version, publish date, and git head', function () {
        expect<ReleasePlanRegistryMetadata['version']>().type.toBe<string>();
        expect<ReleasePlanRegistryMetadata['publishedAt']>().type.toBe<Date | undefined>();
        expect<ReleasePlanRegistryMetadata['gitHead']>().type.toBe<string | undefined>();
    });

    test('a partial failure carries succeeded package plans and a list of errors', function () {
        type PartialFailure = Extract<ReleasePlanError, { readonly type: 'partial'; }>;
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
