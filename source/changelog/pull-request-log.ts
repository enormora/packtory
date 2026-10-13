import type {
    ChangelogEntryInput as LibraryChangelogEntryInput,
    PrLogEngine as LibraryEngine,
    PrLogEngineOptions as LibraryEngineOptions,
    PullRequest as LibraryPullRequest,
    PullRequestWithLabel as LibraryPullRequestWithLabel,
    PrLogConfig as LibraryConfiguration,
    PullRequestChangedFile as LibraryChangedFile
} from '@pr-log/core';
import type { Except } from 'type-fest';

export type PullRequestLogConfiguration = Readonly<LibraryConfiguration>;
export type PullRequestChangedFile = Readonly<LibraryChangedFile>;

export type PullRequest = { readonly identifier: number; readonly title: string; };
export type PullRequestWithLabel = PullRequest & { readonly label: string; };
type ChangelogEntryInput = {
    readonly identifier: number | undefined;
    readonly title: string;
    readonly label: string;
};
type TargetChangelogContents = {
    readonly targetName: string;
    readonly mergedPullRequests: readonly ChangelogEntryInput[];
};
type TargetRelease = { readonly unreleased: false; readonly versionNumber: string; };
type TargetPreview = { readonly unreleased: true; readonly versionNumber: undefined; };
export type TargetChangelogSection = TargetChangelogContents & (TargetPreview | TargetRelease);

type FieldNames = {
    readonly config: 'configuration';
    readonly githubRepo: 'githubRepository';
    readonly baseRef: 'baseReference';
    readonly explicitBaseRef: 'explicitBaseReference';
    readonly githubApiBaseUrl: 'githubApplicationProgrammingInterfaceBaseAddress';
};
type FieldValues = {
    readonly pullRequests: readonly PullRequest[];
    readonly mergedPullRequests: readonly ChangelogEntryInput[];
    readonly targets: readonly TargetChangelogSection[];
};
type InternalInput<Input> = {
    readonly [Key in keyof Input as Key extends keyof FieldNames ? FieldNames[Key] : Key]: Key extends keyof FieldValues
        ? FieldValues[Key]
        : Input[Key];
};
type MethodInput<Method extends keyof LibraryEngine> = InternalInput<Parameters<LibraryEngine[Method]>[0]>;
type ChangelogBaseReference = { readonly reference: string; };
type ResolveVersionInput = Except<MethodInput<'resolveVersionNumber'>, 'mergedPullRequests'> & {
    readonly mergedPullRequests: readonly PullRequestWithLabel[];
};

export type PullRequestLogEngine = {
    readonly resolveChangelogBaseReference: (
        input: MethodInput<'resolveChangelogBaseRef'>
    ) => Promise<ChangelogBaseReference>;
    readonly resolveLatestSemverChangelogBaseReference: () => Promise<ChangelogBaseReference>;
    readonly collectMergedPullRequests: (
        input: MethodInput<'collectMergedPullRequests'>
    ) => Promise<readonly PullRequest[]>;
    readonly readPullRequestChangedFiles: (
        input: MethodInput<'readPullRequestChangedFiles'>
    ) => ReturnType<LibraryEngine['readPullRequestChangedFiles']>;
    readonly readPullRequestLabels: (
        input: MethodInput<'readPullRequestLabels'>
    ) => ReturnType<LibraryEngine['readPullRequestLabels']>;
    readonly filterPullRequestsByTargetFiles: (
        input: MethodInput<'filterPullRequestsByTargetFiles'>
    ) => readonly PullRequest[];
    readonly resolvePullRequestLabels: (
        input: MethodInput<'resolvePullRequestLabels'>
    ) => Promise<readonly PullRequestWithLabel[]>;
    readonly resolveVersionNumber: (input: ResolveVersionInput) => string;
    readonly extractChangelogReleaseSection: LibraryEngine['extractChangelogReleaseSection'];
    readonly renderChangelog: (input: MethodInput<'renderChangelog'>) => string;
    readonly renderTargetChangelog: (input: MethodInput<'renderTargetChangelog'>) => string;
    readonly renderGroupedTargetChangelog: (input: MethodInput<'renderGroupedTargetChangelog'>) => string;
    readonly updateChangelog: LibraryEngine['updateChangelog'];
};
export type PullRequestLogEngineOptions = InternalInput<LibraryEngineOptions>;

function toLibraryRequest(request: PullRequest): LibraryPullRequest {
    const { identifier, ...fields } = request;
    return { ...fields, id: identifier };
}
function toLibraryLabeledRequest(request: PullRequestWithLabel): LibraryPullRequestWithLabel {
    const { identifier, ...fields } = request;
    return { ...fields, id: identifier };
}
function toLibraryEntry(entry: ChangelogEntryInput): LibraryChangelogEntryInput {
    const { identifier, ...fields } = entry;
    return { ...fields, id: identifier };
}
function toInternalPullRequest(request: LibraryPullRequest): PullRequest {
    const { id: identifier, ...fields } = request;
    return { ...fields, identifier };
}

function toInternalLabeledRequest(request: LibraryPullRequestWithLabel): PullRequestWithLabel {
    const { id: identifier, ...fields } = request;
    return { ...fields, identifier };
}

function adaptPullRequestLogEngine(engine: LibraryEngine): PullRequestLogEngine {
    return {
        async resolveChangelogBaseReference({ explicitBaseReference, ...input }) {
            const result = await engine.resolveChangelogBaseRef({ ...input, explicitBaseRef: explicitBaseReference });
            return { reference: result.ref };
        },
        async resolveLatestSemverChangelogBaseReference() {
            const result = await engine.resolveLatestSemverChangelogBaseRef();
            return { reference: result.ref };
        },
        async collectMergedPullRequests({ githubRepository, baseReference }) {
            const requests = await engine.collectMergedPullRequests({
                githubRepo: githubRepository,
                baseRef: baseReference
            });
            return requests.map(toInternalPullRequest);
        },
        async readPullRequestChangedFiles({ githubRepository, pullRequests }) {
            return engine.readPullRequestChangedFiles({
                githubRepo: githubRepository,
                pullRequests: pullRequests.map(toLibraryRequest)
            });
        },
        async readPullRequestLabels({ githubRepository, pullRequests }) {
            return engine.readPullRequestLabels({
                githubRepo: githubRepository,
                pullRequests: pullRequests.map(toLibraryRequest)
            });
        },
        filterPullRequestsByTargetFiles({ pullRequests, ...input }) {
            return engine
                .filterPullRequestsByTargetFiles({
                    ...input,
                    pullRequests: pullRequests.map(toLibraryRequest)
                })
                .map(toInternalPullRequest);
        },
        async resolvePullRequestLabels({ githubRepository, configuration, pullRequests, ...input }) {
            const requests = await engine.resolvePullRequestLabels({
                ...input,
                githubRepo: githubRepository,
                config: configuration,
                pullRequests: pullRequests.map(toLibraryRequest)
            });
            return requests.map(toInternalLabeledRequest);
        },
        resolveVersionNumber({ configuration, mergedPullRequests, ...input }) {
            return engine.resolveVersionNumber({
                ...input,
                config: configuration,
                mergedPullRequests: mergedPullRequests.map(toLibraryLabeledRequest)
            });
        },
        extractChangelogReleaseSection(input) {
            return engine.extractChangelogReleaseSection(input);
        },
        renderChangelog({ configuration, githubRepository, mergedPullRequests, ...input }) {
            return engine.renderChangelog({
                ...input,
                config: configuration,
                githubRepo: githubRepository,
                mergedPullRequests: mergedPullRequests.map(toLibraryEntry)
            });
        },
        renderTargetChangelog({ configuration, githubRepository, mergedPullRequests, ...input }) {
            return engine.renderTargetChangelog({
                ...input,
                config: configuration,
                githubRepo: githubRepository,
                mergedPullRequests: mergedPullRequests.map(toLibraryEntry)
            });
        },
        renderGroupedTargetChangelog({ configuration, githubRepository, targets, ...input }) {
            return engine.renderGroupedTargetChangelog({
                ...input,
                config: configuration,
                githubRepo: githubRepository,
                targets: targets.map(function ({ mergedPullRequests, ...target }) {
                    return { ...target, mergedPullRequests: mergedPullRequests.map(toLibraryEntry) };
                })
            });
        },
        updateChangelog(input) {
            return engine.updateChangelog(input);
        }
    };
}
type LibraryEngineFactory = (options: Readonly<LibraryEngineOptions>) => LibraryEngine;

export function createPullRequestLogEngineFactory(
    createLibraryEngine: LibraryEngineFactory
): (options: Readonly<PullRequestLogEngineOptions>) => PullRequestLogEngine {
    return function ({ configuration, githubApplicationProgrammingInterfaceBaseAddress, ...options }) {
        return adaptPullRequestLogEngine(createLibraryEngine({
            ...options,
            config: configuration,
            githubApiBaseUrl: githubApplicationProgrammingInterfaceBaseAddress
        }));
    };
}
