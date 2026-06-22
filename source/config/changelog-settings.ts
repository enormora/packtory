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
            z.refine((value) => {
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
const validLabelsSchema = z.readonly(z.record(nonEmptyStringSchema, nonEmptyStringSchema));

export const changelogSettingsSchema = z.readonly(
    z.strictObject({
        explicitBaseRef: z.optional(nonEmptyStringSchema),
        labels: z.optional(validLabelsSchema),
        outputs: z.optional(z.readonly(z.tuple([changelogOutputSchema], changelogOutputSchema))),
        packageTagFormat: z.optional(nonEmptyStringSchema),
        targetScopedLabelPattern: z.optional(nonEmptyStringSchema)
    })
);

export type ChangelogOutput = z.infer<typeof changelogOutputSchema>;
export type ChangelogSettings = z.infer<typeof changelogSettingsSchema>;

type PackageChangelogValidationConfig = {
    readonly [key: string]: unknown;
    readonly sourcesFolder?: string | undefined;
};

type ChangelogValidationConfig = {
    readonly [key: string]: unknown;
    readonly changelog?: ChangelogSettings | undefined;
    readonly commonPackageSettings?:
        | { readonly [key: string]: unknown; readonly sourcesFolder?: string | undefined }
        | undefined;
    readonly packages: readonly PackageChangelogValidationConfig[];
};

function normalizeRelativePath(filePath: string): string {
    return filePath.split(/[/\\]/u).join('/');
}

function normalizeFilePath(...filePathSegments: readonly string[]): string {
    return path.normalize(path.join(...filePathSegments.map(normalizeRelativePath)));
}

function normalizeChangelogOutputPath(filePath: string): string {
    return path.normalize(normalizeRelativePath(filePath));
}

function pushDuplicateValueIssues(
    issues: string[],
    values: readonly string[],
    messageFor: (value: string) => string
): void {
    const seenValues = new Set<string>();
    const reportedValues = new Set<string>();

    for (const value of values) {
        if (seenValues.has(value) && !reportedValues.has(value)) {
            issues.push(messageFor(value));
            reportedValues.add(value);
        }
        seenValues.add(value);
    }
}

function resolveSourcesFolder(
    packageConfig: PackageChangelogValidationConfig,
    packtoryConfig: ChangelogValidationConfig
): string | undefined {
    return packageConfig.sourcesFolder ?? packtoryConfig.commonPackageSettings?.sourcesFolder;
}

function collectPackageFileDestinationPaths(
    packtoryConfig: ChangelogValidationConfig,
    output: ChangelogOutput
): readonly string[] {
    if (output.kind !== 'package-file') {
        return [];
    }
    if ('paths' in output) {
        return Object.values(output.paths).map(normalizeChangelogOutputPath);
    }
    return packtoryConfig.packages.flatMap((packageConfig) => {
        const sourcesFolder = resolveSourcesFolder(packageConfig, packtoryConfig);
        if (sourcesFolder === undefined) {
            return [];
        }
        return [normalizeFilePath(sourcesFolder, output.path)];
    });
}

function validateTargetScopedLabelPattern(pattern: string | undefined): readonly string[] {
    if (pattern === undefined) {
        return [];
    }
    if (!pattern.includes('{targetName}') || !pattern.includes('{label}')) {
        return ['changelog.targetScopedLabelPattern must contain {targetName} and {label}'];
    }
    return [];
}

function collectChangelogOutputIssues(
    packtoryConfig: ChangelogValidationConfig,
    outputs: readonly ChangelogOutput[]
): readonly string[] {
    const issues: string[] = [];
    const githubReleaseCount = outputs.filter((output) => {
        return output.kind === 'github-release';
    }).length;

    if (githubReleaseCount > 1) {
        issues.push('changelog.outputs must not contain duplicate github-release outputs');
    }

    pushDuplicateValueIssues(
        issues,
        outputs.flatMap((output) => {
            return output.kind === 'repository-file' ? [normalizeRelativePath(output.path)] : [];
        }),
        (duplicatePath) => {
            return `changelog.outputs must not contain duplicate repository-file path "${duplicatePath}"`;
        }
    );

    pushDuplicateValueIssues(
        issues,
        outputs.flatMap((output) => {
            return collectPackageFileDestinationPaths(packtoryConfig, output);
        }),
        (duplicatePath) => {
            return [
                'changelog.outputs package-file destinations must resolve to unique files;',
                `"${duplicatePath}" is duplicated`
            ].join(' ');
        }
    );

    return issues;
}

export function validateChangelogSettings(packtoryConfig: ChangelogValidationConfig): readonly string[] {
    if (packtoryConfig.changelog === undefined) {
        return [];
    }

    const patternIssues = validateTargetScopedLabelPattern(packtoryConfig.changelog.targetScopedLabelPattern);
    const { outputs } = packtoryConfig.changelog;
    return outputs === undefined
        ? patternIssues
        : [...patternIssues, ...collectChangelogOutputIssues(packtoryConfig, outputs)];
}
