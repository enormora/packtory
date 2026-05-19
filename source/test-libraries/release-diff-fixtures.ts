import type { PackageReleaseDiff } from '../report/release-diff/file-set-diff.ts';

export function createPackageReleaseDiff(overrides: Partial<PackageReleaseDiff> = {}): PackageReleaseDiff {
    return {
        name: 'pkg-a',
        state: 'changed',
        versionTransition: '1.0.0 -> 1.0.1',
        previousVersionLabel: '1.0.0',
        files: { added: [], removed: [], modified: [], unchanged: [] },
        ...overrides
    };
}
