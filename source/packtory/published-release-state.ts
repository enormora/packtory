import type { PublishedReleaseArtifacts } from '../bundle-emitter/fetch-published-artifacts.ts';

export const publishedReleaseStatus = {
    alreadyPublished: 'already-published',
    initialVersion: 'initial-version',
    newVersion: 'new-version'
} as const;

export type PublishedReleaseStatus = (typeof publishedReleaseStatus)[keyof typeof publishedReleaseStatus];

type BuildResultWithPublishedState = {
    readonly previousReleaseArtifacts: PublishedReleaseArtifactsMaybe;
    readonly status: PublishedReleaseStatus;
};

type NoPublishedReleaseArtifacts = { readonly isJust: false; };
type PublishedReleaseArtifactsValue = { readonly isJust: true; readonly value: PublishedReleaseArtifacts; };
type PublishedReleaseArtifactStates = readonly [
    NoPublishedReleaseArtifacts,
    PublishedReleaseArtifactsValue
];
type PublishedReleaseArtifactsMaybe = PublishedReleaseArtifactStates[number];

export function wasAlreadyPublished(buildResult: BuildResultWithPublishedState): boolean {
    return buildResult.status === publishedReleaseStatus.alreadyPublished;
}

export function publishedReleaseArtifactsOf(
    buildResult: BuildResultWithPublishedState
): PublishedReleaseArtifacts | undefined {
    return buildResult.previousReleaseArtifacts.isJust ? buildResult.previousReleaseArtifacts.value : undefined;
}
