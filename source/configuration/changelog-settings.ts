import path from 'node:path';
import { z } from 'zod/mini';
import { bundleRelativePathSchema, nonEmptyStringSchema } from './base-validations.ts';

const repositoryFileOutputSchema = z.readonly(
    z.strictObject({
        kind: z.literal('repository-file'),
        path: bundleRelativePathSchema
    })
);

const packageFileOutputSchema = z.readonly(
    z.strictObject({
        kind: z.literal('package-file'),
        path: bundleRelativePathSchema
    })
);

const explicitPackageFileOutputSchema = z.readonly(
    z.strictObject({
        kind: z.literal('package-file'),
        paths: z.readonly(z.record(nonEmptyStringSchema, bundleRelativePathSchema)).check(
            z.refine(function (value) {
                return Object.keys(value).length > 0;
            })
        )
    })
);

const githubReleaseOutputSchema = z.readonly(
    z.strictObject({
        kind: z.literal('github-release')
    })
);

const changelogOutputSchema = z.union([
    repositoryFileOutputSchema,
    packageFileOutputSchema,
    explicitPackageFileOutputSchema,
    githubReleaseOutputSchema
]);

const pullRequestLogVersionBumpsSchema = z.readonly(
    z.strictObject({
        major: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
        minor: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
        patch: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
    })
);

const pullRequestLogCollapseRuleSchema = z.readonly(
    z.strictObject({
        label: nonEmptyStringSchema,
        pattern: nonEmptyStringSchema,
        replace: nonEmptyStringSchema,
        keyGroup: z.optional(nonEmptyStringSchema),
        collapse: z.optional(z.literal('same')),
        fromGroup: z.optional(nonEmptyStringSchema),
        toGroup: z.optional(nonEmptyStringSchema),
        versionGroup: z.optional(nonEmptyStringSchema)
    })
);

const pullRequestLogSettingsSchema = z.readonly(
    z.strictObject({
        validLabels: z.optional(z.readonly(z.record(nonEmptyStringSchema, nonEmptyStringSchema))),
        ignoredLabels: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
        versionBumps: z.optional(pullRequestLogVersionBumpsSchema),
        dateFormat: z.optional(nonEmptyStringSchema),
        collapseRules: z.optional(z.readonly(z.array(pullRequestLogCollapseRuleSchema))),
        labelLookupIntervalMilliseconds: z.optional(z.number()),
        maximumRateLimitRetryCount: z.optional(z.number())
    })
);

export const changelogSettingsSchema = z.readonly(
    z.strictObject({
        explicitBaseReference: z.optional(nonEmptyStringSchema),
        outputs: z.optional(z.readonly(z.tuple([ changelogOutputSchema ], changelogOutputSchema))),
        packageTagFormat: z.optional(nonEmptyStringSchema),
        pullRequestLog: z.optional(pullRequestLogSettingsSchema),
        targetScopedLabelPattern: z.optional(nonEmptyStringSchema)
    })
);

export type ChangelogOutput = z.infer<typeof changelogOutputSchema>;
type PullRequestLogCollapseRuleSettings = {
    readonly label: string;
    readonly pattern: string;
    readonly replace: string;
    readonly keyGroup?: string | undefined;
    readonly collapse?: 'same' | undefined;
    readonly fromGroup?: string | undefined;
    readonly toGroup?: string | undefined;
    readonly versionGroup?: string | undefined;
};
export type ChangelogSettings = {
    readonly explicitBaseReference?: string | undefined;
    readonly outputs?: readonly [ChangelogOutput, ...(readonly ChangelogOutput[])] | undefined;
    readonly packageTagFormat?: string | undefined;
    readonly pullRequestLog?: {
        readonly validLabels?: Readonly<Record<string, string>> | undefined;
        readonly ignoredLabels?: readonly string[] | undefined;
        readonly versionBumps?: {
            readonly major?: readonly string[] | undefined;
            readonly minor?: readonly string[] | undefined;
            readonly patch?: readonly string[] | undefined;
        } | undefined;
        readonly dateFormat?: string | undefined;
        readonly collapseRules?: readonly PullRequestLogCollapseRuleSettings[] | undefined;
        readonly labelLookupIntervalMilliseconds?: number | undefined;
        readonly maximumRateLimitRetryCount?: number | undefined;
    } | undefined;
    readonly targetScopedLabelPattern?: string | undefined;
};

type PackageChangelogValidationConfiguration = {
    readonly [key: string]: unknown;
    readonly sourcesFolder?: string | undefined;
};

type CommonPackageChangelogValidationConfiguration = {
    readonly [key: string]: unknown;
    readonly sourcesFolder?: string | undefined;
};

type ChangelogValidationConfiguration = {
    readonly [key: string]: unknown;
    readonly changelog?: ChangelogSettings | undefined;
    readonly commonPackageSettings?: CommonPackageChangelogValidationConfiguration | undefined;
    readonly packages: readonly PackageChangelogValidationConfiguration[];
};

type ExplicitPackageFileOutput = z.infer<typeof explicitPackageFileOutputSchema>;

function normalizeRelativePath(filePath: string): string {
    return filePath.replaceAll(/[/\\]/gu, '/');
}

function normalizeFilePath(...filePathSegments: readonly string[]): string {
    return path.normalize(path.join(...filePathSegments.map(normalizeRelativePath)));
}

function normalizeChangelogOutputPath(filePath: string): string {
    return path.normalize(normalizeRelativePath(filePath));
}

function collectDuplicateValueIssues(
    values: readonly string[],
    messageFor: (value: string) => string
): readonly string[] {
    const issues: string[] = [];
    const seenValues = new Set<string>();
    const reportedValues = new Set<string>();

    for (const value of values) {
        if (seenValues.has(value) && !reportedValues.has(value)) {
            issues.push(messageFor(value));
            reportedValues.add(value);
        }
        seenValues.add(value);
    }

    return issues;
}

function hasExplicitPackageFilePaths(output: ChangelogOutput): output is ExplicitPackageFileOutput {
    return Object.hasOwn(output, 'paths');
}

function resolveSourcesFolder(
    packageConfiguration: PackageChangelogValidationConfiguration,
    packtoryConfiguration: ChangelogValidationConfiguration
): string | undefined {
    return packageConfiguration.sourcesFolder ?? packtoryConfiguration.commonPackageSettings?.sourcesFolder;
}

function collectPackageFileDestinationPaths(
    packtoryConfiguration: ChangelogValidationConfiguration,
    output: ChangelogOutput
): readonly string[] {
    if (output.kind !== 'package-file') {
        return [];
    }
    if (hasExplicitPackageFilePaths(output)) {
        return Object.values(output.paths).map(normalizeChangelogOutputPath);
    }
    return packtoryConfiguration.packages.flatMap(function (packageConfiguration) {
        const sourcesFolder = resolveSourcesFolder(packageConfiguration, packtoryConfiguration);
        if (sourcesFolder === undefined) {
            return [];
        }
        return [ normalizeFilePath(sourcesFolder, output.path) ];
    });
}

function validateTargetScopedLabelPattern(pattern: string | undefined): readonly string[] {
    if (pattern === undefined) {
        return [];
    }
    if (!pattern.includes('{targetName}') || !pattern.includes('{label}')) {
        return [ 'changelog.targetScopedLabelPattern must contain {targetName} and {label}' ];
    }
    return [];
}

function collectChangelogOutputIssues(
    packtoryConfiguration: ChangelogValidationConfiguration,
    outputs: readonly ChangelogOutput[]
): readonly string[] {
    const githubReleaseCount = outputs
        .filter(function (output) {
            return output.kind === 'github-release';
        })
        .length;
    const githubReleaseIssues = githubReleaseCount > 1
        ? [ 'changelog.outputs must not contain duplicate github-release outputs' ]
        : [];
    const repositoryFileIssues = collectDuplicateValueIssues(
        outputs.flatMap(function (output) {
            return output.kind === 'repository-file' ? [ normalizeRelativePath(output.path) ] : [];
        }),
        function (duplicatePath) {
            return `changelog.outputs must not contain duplicate repository-file path "${duplicatePath}"`;
        }
    );
    const packageFileIssues = collectDuplicateValueIssues(
        outputs.flatMap(function (output) {
            return collectPackageFileDestinationPaths(packtoryConfiguration, output);
        }),
        function (duplicatePath) {
            return [
                'changelog.outputs package-file destinations must resolve to unique files;',
                `"${duplicatePath}" is duplicated`
            ]
                .join(' ');
        }
    );

    return [ ...githubReleaseIssues, ...repositoryFileIssues, ...packageFileIssues ];
}

export function validateChangelogSettings(packtoryConfiguration: ChangelogValidationConfiguration): readonly string[] {
    if (packtoryConfiguration.changelog === undefined) {
        return [];
    }

    const patternIssues = validateTargetScopedLabelPattern(packtoryConfiguration.changelog.targetScopedLabelPattern);
    const { outputs } = packtoryConfiguration.changelog;
    return outputs === undefined
        ? patternIssues
        : [ ...patternIssues, ...collectChangelogOutputIssues(packtoryConfiguration, outputs) ];
}
