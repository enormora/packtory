import path from 'node:path';
import { z } from 'zod/mini';
import { bundleRelativePathSchema } from './base-validations.ts';

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

const githubReleaseOutputSchema = z.readonly(
    z.strictObject({
        kind: z.literal('github-release')
    })
);

const changelogOutputSchema = z.union([repositoryFileOutputSchema, packageFileOutputSchema, githubReleaseOutputSchema]);

export const changelogSettingsSchema = z.readonly(
    z.strictObject({
        outputs: z.readonly(z.tuple([changelogOutputSchema], changelogOutputSchema))
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

function normalizedRelativePath(filePath: string): string {
    return filePath.split(/[/\\]/u).join('/');
}

function normalizedFilePath(...filePathSegments: readonly string[]): string {
    return path.normalize(path.join(...filePathSegments.map(normalizedRelativePath)));
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

function sourcesFolderFor(
    packageConfig: PackageChangelogValidationConfig,
    packtoryConfig: ChangelogValidationConfig
): string | undefined {
    return packageConfig.sourcesFolder ?? packtoryConfig.commonPackageSettings?.sourcesFolder;
}

function packageFileDestinationPaths(packtoryConfig: ChangelogValidationConfig, outputPath: string): readonly string[] {
    return packtoryConfig.packages.flatMap((packageConfig) => {
        const sourcesFolder = sourcesFolderFor(packageConfig, packtoryConfig);
        if (sourcesFolder === undefined) {
            return [];
        }
        return [normalizedFilePath(sourcesFolder, outputPath)];
    });
}

export function validateChangelogSettings(packtoryConfig: ChangelogValidationConfig): readonly string[] {
    if (packtoryConfig.changelog === undefined) {
        return [];
    }

    const { outputs } = packtoryConfig.changelog;
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
            return output.kind === 'repository-file' ? [normalizedRelativePath(output.path)] : [];
        }),
        (duplicatePath) => {
            return `changelog.outputs must not contain duplicate repository-file path "${duplicatePath}"`;
        }
    );

    pushDuplicateValueIssues(
        issues,
        outputs.flatMap((output) => {
            return output.kind === 'package-file' ? packageFileDestinationPaths(packtoryConfig, output.path) : [];
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
