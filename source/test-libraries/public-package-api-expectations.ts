import type {
    BuildAndPublishAllOptions,
    PackageDependencyInspectionOutcome,
    PackAllOutcome,
    PackAllPublicOptions,
    PacktoryConfiguration,
    PublishAllOutcome,
    PublishAllResult,
    ReleasePlanOutcome,
    ReleasePlanResult,
    ResolveAndLinkAllOptions,
    ResolveAndLinkAllOutcome
} from '../packages/packtory/packtory.entry-point.ts';

export type ProgressListener = (payload: unknown) => void;

export declare const progressListener: ProgressListener;

export type BuildAndPublishAllFunction = (
    configuration: unknown,
    options: BuildAndPublishAllOptions
) => Promise<PublishAllOutcome>;

export type ResolveAndLinkAllFunction = (
    configuration: unknown,
    options?: ResolveAndLinkAllOptions
) => Promise<ResolveAndLinkAllOutcome>;

export type PlanReleaseAgainstLatestPublishedFunction = (configuration: unknown) => Promise<ReleasePlanOutcome>;

export type PackAllPackagesFunction = (
    configuration: unknown,
    options: PackAllPublicOptions
) => Promise<PackAllOutcome>;

export type InspectPackageDependenciesFunction = (
    configuration: unknown,
    packageName: string
) => Promise<PackageDependencyInspectionOutcome>;

export type PackageConfiguration = PacktoryConfiguration['packages'][number];

export type ChangelogSettings = NonNullable<PacktoryConfiguration['changelog']>;

export type Root = PackageConfiguration['roots'][string];

export type LabelLookupIntervalMilliseconds = 500;

export type MaximumRateLimitRetryCount = 5;

export type ConfigurationWithVersioning<TVersioning> = {
    readonly registrySettings: {
        readonly authentication: { readonly type: 'bearer-token'; readonly token: 'any-token'; };
    };
    readonly packages: readonly [
        {
            readonly name: 'package-a';
            readonly roots: { readonly main: { readonly javaScript: 'index.js'; }; };
            readonly versioning: TVersioning;
        }
    ];
};

type OkVariant<TResult> = Extract<TResult, { readonly isOk: true; }>;

type ErrorVariant<TResult> = Extract<TResult, { readonly isErr: true; }>;

export type PublishOk = OkVariant<PublishAllResult>['value'];

export type PublishError = ErrorVariant<PublishAllResult>['error'];

export type BuildAndPublishResult = PublishOk[number];

export type ReleasePlanOk = OkVariant<ReleasePlanResult>['value'];

export type ReleasePlanError = ErrorVariant<ReleasePlanResult>['error'];

export type ResultFailureType = 'checks' | 'configuration' | 'partial';

export type ReleasePlanArtifactState = 'changed' | 'first-publish' | 'unchanged';

export type PackageDependencyOrigin = 'bundle' | 'bundle-peer' | 'external';

export type PackageDependencyManifestState = 'emitted' | 'invalid-version' | 'missing-version';
