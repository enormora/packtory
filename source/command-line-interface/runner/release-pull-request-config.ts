import { z } from 'zod/mini';
import { safeParse } from '../../common/schema-validation.ts';
import { releasePullRequestSettingsSchema, type ReleasePullRequestSettings } from './release-pull-request-settings.ts';

type GitHubActionsCiConfig = {
    readonly deleteActionRequiredPullRequestRuns: boolean;
    readonly requiredStatusContexts: readonly string[];
    readonly workflowFile: string;
};

export type ReleasePullRequestConfig = {
    readonly automationAuthor: string;
    readonly body: string;
    readonly branch: string;
    readonly commitSubject: string;
    readonly defaultBranch: string;
    readonly githubActionsCi: GitHubActionsCiConfig | undefined;
    readonly label: string;
    readonly title: string;
};

type ReleasePullRequestConfigContainer = {
    readonly releasePullRequest?: ReleasePullRequestSettings | undefined;
};
type StringReleasePullRequestSetting = Exclude<keyof ReleasePullRequestConfig, 'githubActionsCi'>;

const releasePullRequestConfigContainerSchema = z.readonly(
    z.object({ releasePullRequest: z.optional(releasePullRequestSettingsSchema) })
);

const defaultReleasePullRequestConfig: ReleasePullRequestConfig = {
    automationAuthor: 'github-actions[bot]',
    body: 'Updates changelogs for the next release.',
    branch: 'release/packtory',
    commitSubject: 'Release packages',
    defaultBranch: 'main',
    githubActionsCi: undefined,
    label: 'release',
    title: 'Prepare release'
};

function resolveGitHubActionsCiConfig(
    settings: ReleasePullRequestSettings['githubActionsCi']
): GitHubActionsCiConfig | undefined {
    if (settings === undefined) {
        return undefined;
    }
    return {
        deleteActionRequiredPullRequestRuns: settings.deleteActionRequiredPullRequestRuns ?? true,
        requiredStatusContexts: settings.requiredStatusContexts,
        workflowFile: settings.workflowFile
    };
}

function resolveStringSetting(
    settings: ReleasePullRequestSettings | undefined,
    setting: StringReleasePullRequestSetting
): string {
    return settings?.[setting] ?? defaultReleasePullRequestConfig[setting];
}

export function resolveReleasePullRequestConfig(config: ReleasePullRequestConfigContainer): ReleasePullRequestConfig {
    const { releasePullRequest } = config;
    return {
        automationAuthor: resolveStringSetting(releasePullRequest, 'automationAuthor'),
        body: resolveStringSetting(releasePullRequest, 'body'),
        branch: resolveStringSetting(releasePullRequest, 'branch'),
        commitSubject: resolveStringSetting(releasePullRequest, 'commitSubject'),
        defaultBranch: resolveStringSetting(releasePullRequest, 'defaultBranch'),
        githubActionsCi: resolveGitHubActionsCiConfig(releasePullRequest?.githubActionsCi),
        label: resolveStringSetting(releasePullRequest, 'label'),
        title: resolveStringSetting(releasePullRequest, 'title')
    };
}

export function parseReleasePullRequestConfigContainer(config: unknown): ReleasePullRequestConfigContainer | undefined {
    const result = safeParse(releasePullRequestConfigContainerSchema, config);
    return result.success ? result.data : undefined;
}
