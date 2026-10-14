import { z } from 'zod/mini';
import { Result } from 'true-myth';
import { safeParse } from '../../common/schema-validation.ts';
import { packtoryConfigurationSchema } from '../../configuration/packtory-configuration-schema.ts';
import { releasePullRequestSettingsSchema, type ReleasePullRequestSettings } from './release-pull-request-settings.ts';

type GitHubActionsContinuousIntegrationConfiguration = {
    readonly deleteActionRequiredPullRequestRuns: boolean;
    readonly requiredStatusContexts: readonly string[];
    readonly workflowFile: string;
};

export type ReleasePullRequestConfiguration = {
    readonly automationAuthor: string;
    readonly body: string;
    readonly branch: string;
    readonly commitSubject: string;
    readonly defaultBranch: string;
    readonly githubActionsContinuousIntegration: GitHubActionsContinuousIntegrationConfiguration | undefined;
    readonly label: string;
    readonly title: string;
};

const releasePullRequestConfigurationContainerSchema = z.readonly(
    z.object({ releasePullRequest: z.optional(releasePullRequestSettingsSchema) })
);
const commandLineInterfacePacktoryConfigurationSchema = z.intersection(
    packtoryConfigurationSchema,
    releasePullRequestConfigurationContainerSchema
);

export type ReleasePullRequestConfigurationContainer = z.infer<typeof releasePullRequestConfigurationContainerSchema>;
export type CommandLineInterfacePacktoryConfiguration = Readonly<
    z.infer<typeof commandLineInterfacePacktoryConfigurationSchema>
>;
export type CommandLineInterfacePacktoryConfigurationResult = Result<
    CommandLineInterfacePacktoryConfiguration,
    readonly string[]
>;
type StringReleasePullRequestSetting = Exclude<
    keyof ReleasePullRequestConfiguration,
    'githubActionsContinuousIntegration'
>;

const defaultReleasePullRequestConfiguration: ReleasePullRequestConfiguration = {
    automationAuthor: 'github-actions[bot]',
    body: 'Updates changelogs for the next release.',
    branch: 'release/packtory',
    commitSubject: 'Release packages',
    defaultBranch: 'main',
    githubActionsContinuousIntegration: undefined,
    label: 'release',
    title: 'Prepare release'
};

function resolveGitHubActionsContinuousIntegrationConfiguration(
    settings: ReleasePullRequestSettings['githubActionsContinuousIntegration']
): GitHubActionsContinuousIntegrationConfiguration | undefined {
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
    return settings?.[setting] ?? defaultReleasePullRequestConfiguration[setting];
}

export function resolveReleasePullRequestConfiguration(
    configuration: ReleasePullRequestConfigurationContainer
): ReleasePullRequestConfiguration {
    const { releasePullRequest } = configuration;
    return {
        automationAuthor: resolveStringSetting(releasePullRequest, 'automationAuthor'),
        body: resolveStringSetting(releasePullRequest, 'body'),
        branch: resolveStringSetting(releasePullRequest, 'branch'),
        commitSubject: resolveStringSetting(releasePullRequest, 'commitSubject'),
        defaultBranch: resolveStringSetting(releasePullRequest, 'defaultBranch'),
        githubActionsContinuousIntegration: resolveGitHubActionsContinuousIntegrationConfiguration(
            releasePullRequest?.githubActionsContinuousIntegration
        ),
        label: resolveStringSetting(releasePullRequest, 'label'),
        title: resolveStringSetting(releasePullRequest, 'title')
    };
}

export function parseCommandLineInterfacePacktoryConfiguration(
    configuration: unknown
): CommandLineInterfacePacktoryConfiguration | undefined {
    const result = safeParse(commandLineInterfacePacktoryConfigurationSchema, configuration);
    return result.success ? result.data : undefined;
}

export function validateCommandLineInterfacePacktoryConfiguration(
    configuration: unknown
): CommandLineInterfacePacktoryConfigurationResult {
    const result = safeParse(commandLineInterfacePacktoryConfigurationSchema, configuration);
    return result.success ? Result.ok(result.data) : Result.err(result.error.issues);
}
