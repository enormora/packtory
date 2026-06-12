import { describe, test, expect } from 'tstyche';
import type { Result } from 'true-myth';
import type { PublicationOutcome } from '../../bundle-emitter/publication-outcome.ts';
import type { MetadataAuthMode, PublishAuthStrategy } from '../../config/registry-settings.ts';
import type {
    buildAndPublishAll,
    planReleaseAgainstLatestPublished,
    progressBroadcastConsumer,
    resolveAndLinkAll,
    BuildReport,
    PacktoryConfig,
    PublishAllOutcome,
    PublishAllResult,
    ReleasePlan,
    ReleasePlanOutcome,
    ReleasePlanPackage,
    ReleasePlanRegistryMetadata,
    ReleasePlanResult,
    ResolveAndLinkAllOutcome,
    ResolveAndLinkAllResult,
    ResolveAndLinkFailure,
    ResolvedPackage
} from './packtory.entry-point.ts';

type ProgressEventName =
    | 'building'
    | 'done'
    | 'error'
    | 'linking'
    | 'publishing'
    | 'rebuilding'
    | 'resolving'
    | 'scheduled';

type PackageConfig = PacktoryConfig['packages'][number];
type Root = PackageConfig['roots'][string];
type OkVariant<TResult> = Extract<TResult, { isOk: true }>;
type ErrVariant<TResult> = Extract<TResult, { isErr: true }>;
type PublishOk = OkVariant<PublishAllResult>['value'];
type PublishErr = ErrVariant<PublishAllResult>['error'];
type BuildAndPublishResult = PublishOk[number];
type ReleasePlanOk = OkVariant<ReleasePlanResult>['value'];
type ReleasePlanErr = ErrVariant<ReleasePlanResult>['error'];
type ResultFailureType = 'checks' | 'config' | 'partial';
type ReleasePlanArtifactState = 'changed' | 'first-publish' | 'unchanged';

describe('public functions', () => {
    test('buildAndPublishAll takes an unknown config and build options and returns a PublishAllOutcome', () => {
        expect<typeof buildAndPublishAll>().type.toBe<
            (
                config: unknown,
                options: { readonly dryRun: boolean; readonly stage: boolean; readonly collectReport?: boolean }
            ) => Promise<PublishAllOutcome>
        >();
    });

    test('resolveAndLinkAll takes an unknown config and returns a ResolveAndLinkAllOutcome', () => {
        expect<typeof resolveAndLinkAll>().type.toBe<
            (config: unknown, options?: { readonly collectReport?: boolean }) => Promise<ResolveAndLinkAllOutcome>
        >();
    });

    test('planReleaseAgainstLatestPublished takes an unknown config and returns a ReleasePlanOutcome', () => {
        expect<typeof planReleaseAgainstLatestPublished>().type.toBe<
            (config: unknown) => Promise<ReleasePlanOutcome>
        >();
    });
});

describe('PublishAllOutcome', () => {
    test('exposes the wrapped result', () => {
        expect<PublishAllOutcome['result']>().type.toBe<PublishAllResult>();
    });

    test('exposes a getReport method that returns BuildReport or undefined', () => {
        expect<PublishAllOutcome['getReport']>().type.toBe<() => BuildReport | undefined>();
    });
});

describe('ResolveAndLinkAllOutcome', () => {
    test('exposes the wrapped result', () => {
        expect<ResolveAndLinkAllOutcome['result']>().type.toBe<ResolveAndLinkAllResult>();
    });

    test('exposes a getReport method that returns BuildReport or undefined', () => {
        expect<ResolveAndLinkAllOutcome['getReport']>().type.toBe<() => BuildReport | undefined>();
    });
});

describe('ReleasePlanOutcome', () => {
    test('exposes the wrapped result', () => {
        expect<ReleasePlanOutcome['result']>().type.toBe<ReleasePlanResult>();
    });

    test('exposes a getReport method that returns BuildReport', () => {
        expect<ReleasePlanOutcome['getReport']>().type.toBe<() => BuildReport>();
    });
});

describe('progressBroadcastConsumer', () => {
    test('on accepts the documented event names', () => {
        expect<Parameters<typeof progressBroadcastConsumer.on>[0]>().type.toBe<ProgressEventName>();
    });

    test('off accepts the documented event names', () => {
        expect<Parameters<typeof progressBroadcastConsumer.off>[0]>().type.toBe<ProgressEventName>();
    });

    test('exposes only on and off', () => {
        expect<keyof typeof progressBroadcastConsumer>().type.toBe<'off' | 'on'>();
    });
});

describe('PacktoryConfig — accepted shapes', () => {
    test('accepts a minimum valid configuration (registrySettings and packages)', () => {
        expect<PacktoryConfig>().type.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly auth: { readonly type: 'bearer-token'; readonly token: 'any-token' };
            };
            readonly packages: readonly [
                { readonly name: 'pkg'; readonly roots: { readonly main: { readonly js: 'index.js' } } }
            ];
        }>();
    });

    test('accepts a fully populated configuration with all optional fields', () => {
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
            readonly checks: { readonly noDuplicatedFiles: { readonly enabled: true } };
            readonly commonPackageSettings: { readonly sourcesFolder: 'src'; readonly includeSourceMapFiles: true };
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
});

describe('PacktoryConfig — rejected shapes', () => {
    test('accepts a configuration without registrySettings (read-only ops do not require auth)', () => {
        expect<{
            readonly packages: readonly [{ readonly name: 'pkg'; readonly roots: Record<string, never> }];
        }>().type.toBeAssignableTo<PacktoryConfig>();
    });

    test('rejects a configuration without packages', () => {
        expect<PacktoryConfig>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly auth: { readonly type: 'bearer-token'; readonly token: 'tok' };
            };
        }>();
    });

    test('accepts a registrySettings without auth (publish fails fast at runtime instead)', () => {
        expect<{
            readonly registrySettings: { readonly registryUrl: 'https://registry.example' };
            readonly packages: readonly [{ readonly name: 'pkg'; readonly roots: Record<string, never> }];
        }>().type.toBeAssignableTo<PacktoryConfig>();
    });

    test('rejects a package without name or roots', () => {
        expect<PacktoryConfig>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly auth: { readonly type: 'bearer-token'; readonly token: 'tok' };
            };
            readonly packages: readonly [{ readonly roots: { readonly main: { readonly js: 'index.js' } } }];
        }>();
        expect<PacktoryConfig>().type.not.toBeAssignableFrom<{
            readonly registrySettings: {
                readonly auth: { readonly type: 'bearer-token'; readonly token: 'tok' };
            };
            readonly packages: readonly [{ readonly name: 'pkg' }];
        }>();
    });
});

describe('PacktoryConfig — exposed structure', () => {
    test('exposes the documented top-level keys', () => {
        expect<keyof PacktoryConfig>().type.toBe<
            'checks' | 'commonPackageSettings' | 'packages' | 'registrySettings'
        >();
    });

    test('packages is a readonly array', () => {
        expect<PacktoryConfig['packages']>().type.toBe<readonly PackageConfig[]>();
    });

    test('registrySettings exposes the documented auth fields', () => {
        type RequiredRegistrySettings = NonNullable<PacktoryConfig['registrySettings']>;
        expect<RequiredRegistrySettings['registryUrl']>().type.toBe<string | undefined>();
        type ExpandedAuth = Extract<RequiredRegistrySettings['auth'], { publish: unknown }>;
        expect<ExpandedAuth['publish']>().type.toBe<PublishAuthStrategy>();
        expect<ExpandedAuth['metadata']>().type.toBe<MetadataAuthMode | undefined>();
    });

    test('registrySettings is optional on PacktoryConfig', () => {
        expect<PacktoryConfig['registrySettings']>().type.toBe<
            NonNullable<PacktoryConfig['registrySettings']> | undefined
        >();
    });

    test('PackageConfig requires name and roots', () => {
        expect<PackageConfig['name']>().type.toBe<string>();
        expect<PackageConfig['roots']>().type.toBe<Readonly<Record<string, Root>>>();
    });

    test('Root requires a js path and allows an optional declarationFile', () => {
        expect<Root['js']>().type.toBe<string>();
        expect<Root['declarationFile']>().type.toBe<string | undefined>();
    });

    test('checks.noDuplicatedFiles is toggled at the top level via `enabled`', () => {
        type Checks = NonNullable<PacktoryConfig['checks']>;
        type NoDuplicates = NonNullable<Checks['noDuplicatedFiles']>;
        expect<NoDuplicates['enabled']>().type.toBe<boolean>();
    });

    test('checks.areTheTypesWrong is toggled at the top level via `enabled`', () => {
        type Checks = NonNullable<PacktoryConfig['checks']>;
        type AreTheTypesWrong = NonNullable<Checks['areTheTypesWrong']>;
        expect<AreTheTypesWrong['enabled']>().type.toBe<boolean>();
    });

    test('PackageConfig.checks.noDuplicatedFiles carries the per-package allowList', () => {
        type PackageChecks = NonNullable<PackageConfig['checks']>;
        type NoDuplicates = NonNullable<PackageChecks['noDuplicatedFiles']>;
        expect<NoDuplicates['allowList']>().type.toBe<readonly string[] | undefined>();
    });

    test('PackageConfig.checks.areTheTypesWrong carries the per-package profile override', () => {
        type PackageChecks = NonNullable<PackageConfig['checks']>;
        type AreTheTypesWrong = NonNullable<PackageChecks['areTheTypesWrong']>;
        expect<AreTheTypesWrong['profile']>().type.toBe<'esm-only' | 'node16' | 'strict' | undefined>();
    });
});

describe('PublishAllResult', () => {
    test('is a true-myth Result whose ok value is a readonly array', () => {
        expect<PublishAllResult>().type.toBeAssignableTo<Result<readonly unknown[], unknown>>();
    });

    test('the ok value is a readonly array of build-and-publish results', () => {
        expect<PublishOk>().type.toBe<readonly BuildAndPublishResult[]>();
    });

    test('each result element exposes status and bundle', () => {
        expect<BuildAndPublishResult>().type.toHaveProperty('status');
        expect<BuildAndPublishResult>().type.toHaveProperty('bundle');
        expect<BuildAndPublishResult>().type.toHaveProperty('publication');
    });

    test('the status field is a fixed string union', () => {
        expect<BuildAndPublishResult['status']>().type.toBe<'already-published' | 'initial-version' | 'new-version'>();
    });

    test('the publication field captures whether the package was published, staged, or skipped', () => {
        expect<BuildAndPublishResult['publication']>().type.toBe<PublicationOutcome>();
    });

    test('the failure variant is a discriminated union keyed by `type`', () => {
        expect<PublishErr['type']>().type.toBe<ResultFailureType>();
    });

    test('a checks failure exposes a readonly issues array of strings', () => {
        type ChecksFailure = Extract<PublishErr, { type: 'checks' }>;
        expect<ChecksFailure['issues']>().type.toBe<readonly string[]>();
    });

    test('a config failure exposes a readonly issues array of strings', () => {
        type ConfigFailure = Extract<PublishErr, { type: 'config' }>;
        expect<ConfigFailure['issues']>().type.toBe<readonly string[]>();
    });

    test('a partial failure carries succeeded results and a list of errors', () => {
        type PartialFailure = Extract<PublishErr, { type: 'partial' }>;
        expect<PartialFailure['succeeded']>().type.toBe<readonly BuildAndPublishResult[]>();
        expect<PartialFailure['failures']>().type.toBe<readonly Error[]>();
    });
});

describe('ResolveAndLinkAllResult', () => {
    test('is a Result of readonly ResolvedPackage entries with ResolveAndLinkFailure', () => {
        expect<ResolveAndLinkAllResult>().type.toBe<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>();
    });

    test('the failure variant is a discriminated union keyed by `type`', () => {
        expect<ResolveAndLinkFailure['type']>().type.toBe<ResultFailureType>();
    });
});

describe('ReleasePlanResult', () => {
    test('is a Result of a release plan with a discriminated failure union', () => {
        expect<ReleasePlanResult>().type.toBe<Result<ReleasePlan, ReleasePlanErr>>();
        expect<ReleasePlanErr['type']>().type.toBe<ResultFailureType>();
    });

    test('the ok value exposes release-plan packages', () => {
        expect<ReleasePlanOk['packages']>().type.toBe<readonly ReleasePlanPackage[]>();
    });

    test('each package exposes planned versions, artifacts, and registry metadata', () => {
        expect<ReleasePlanPackage['name']>().type.toBe<string>();
        expect<ReleasePlanPackage['previousVersion']>().type.toBe<string | undefined>();
        expect<ReleasePlanPackage['nextVersion']>().type.toBe<string>();
        expect<ReleasePlanPackage['artifactState']>().type.toBe<ReleasePlanArtifactState>();
        expect<ReleasePlanPackage['changed']>().type.toBe<boolean>();
        expect<ReleasePlanPackage['previousGitHead']>().type.toBe<string | undefined>();
        expect<ReleasePlanPackage['currentGitHead']>().type.toBe<string | undefined>();
        expect<ReleasePlanPackage['latestRegistryMetadata']>().type.toBe<ReleasePlanRegistryMetadata | undefined>();
    });

    test('each package exposes artifact and source file lists', () => {
        expect<ReleasePlanPackage['artifactFiles']>().type.toBe<readonly string[]>();
        expect<ReleasePlanPackage['changedArtifactFiles']>().type.toBe<readonly string[]>();
        expect<ReleasePlanPackage['sourceFiles']>().type.toBe<readonly string[]>();
    });

    test('registry metadata exposes the latest version, publish date, and git head', () => {
        expect<ReleasePlanRegistryMetadata['version']>().type.toBe<string>();
        expect<ReleasePlanRegistryMetadata['publishedAt']>().type.toBe<Date | undefined>();
        expect<ReleasePlanRegistryMetadata['gitHead']>().type.toBe<string | undefined>();
    });

    test('a partial failure carries succeeded package plans and a list of errors', () => {
        type PartialFailure = Extract<ReleasePlanErr, { type: 'partial' }>;
        expect<PartialFailure['succeeded']>().type.toBe<readonly ReleasePlanPackage[]>();
        expect<PartialFailure['failures']>().type.toBe<readonly Error[]>();
    });
});

describe('ResolvedPackage', () => {
    test('exposes name, analyzedBundle, and resolveOptions', () => {
        expect<ResolvedPackage>().type.toHaveProperty('name');
        expect<ResolvedPackage>().type.toHaveProperty('analyzedBundle');
        expect<ResolvedPackage>().type.toHaveProperty('resolveOptions');
        expect<ResolvedPackage['name']>().type.toBe<string>();
    });
});
