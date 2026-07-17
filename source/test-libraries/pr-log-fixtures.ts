import { createFactory } from '@enormora/objectory';

export type PullRequestChangedFileShape = {
    readonly path: string;
    readonly previousPath: string | undefined;
    readonly status: string;
    readonly additions: number;
    readonly deletions: number;
    readonly changes: number;
};

export const pullRequestChangedFileFactory = createFactory<PullRequestChangedFileShape>(function () {
    return {
        path: '',
        previousPath: undefined,
        status: 'modified',
        additions: 1,
        deletions: 0,
        changes: 1
    };
});
