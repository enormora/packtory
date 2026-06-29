import type { ReleasePlanPackage } from '../packtory/packtory-results.ts';

export function createReleasePlanPackageFixture(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'pkg-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: 'old-head',
        currentGitHead: 'new-head',
        latestRegistryMetadata: { version: '1.0.0', publishedAt: undefined, gitHead: 'old-head' },
        artifactFiles: ['index.js'],
        changedArtifactFiles: ['index.js'],
        sourceFiles: ['source/pkg-a.ts'],
        changelogDependencyNames: [],
        changelogSourceFiles: ['source/pkg-a.ts'],
        ...overrides
    };
}
