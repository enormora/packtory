import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import { collectChangelogOutputFilePaths, type ChangelogConfig } from './changelog-destinations.ts';

type FileReader = {
    readonly readFile: (filePath: string) => Promise<string>;
};

export type GitHubReleaseNotesDeps = {
    readonly fileManager: FileReader;
    readonly workingDirectory: string;
};

export type ReleaseNotesTarget = {
    readonly name: string;
    readonly tagName: string;
    readonly version: string;
};

export function missingGitHubReleaseNotes(target: ReleaseNotesTarget): never {
    throw new Error(`GitHub release notes for "${target.tagName}" could not be generated`);
}

function hasReleaseNotes(value: string | undefined): value is string {
    return value !== undefined && value.trim().length > 0;
}

function escapeRegExp(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function releaseNotesHeadingPattern(target: ReleaseNotesTarget): RegExp {
    const packageName = escapeRegExp(target.name);
    const version = escapeRegExp(target.version);
    return new RegExp(`^##\\s+(?:${packageName}\\s+)?${version}(?:\\s|\\(|$)`);
}

function extractReleaseNotes(markdown: string, target: ReleaseNotesTarget): string | undefined {
    const lines = markdown.split(/\r?\n/u);
    const headingPattern = releaseNotesHeadingPattern(target);
    const start = lines.findIndex(function (line) {
        return headingPattern.test(line);
    });
    if (start === -1) {
        return undefined;
    }
    const next = lines.findIndex(function (line, index) {
        return index > start && line.startsWith('## ');
    });
    const end = next === -1 ? lines.length : next;
    const releaseNotes = lines.slice(start, end).join('\n').trim();
    const hasBody = lines.slice(start + 1, end).some(function (line) {
        return line.trim().length > 0;
    });
    return hasBody ? releaseNotes : undefined;
}

function isMissingFileError(error: unknown): boolean {
    return Reflect.get(new Object(error), 'code') === 'ENOENT';
}

function packageChangelogPathFor(
    deps: Pick<GitHubReleaseNotesDeps, 'workingDirectory'>,
    config: ChangelogConfig,
    packageName: string
): string | undefined {
    const outputPath = collectChangelogOutputFilePaths(deps, config).find(function (entry) {
        return entry.packageName === packageName;
    });
    return outputPath?.filePath;
}

async function readConfiguredReleaseNotes(
    deps: GitHubReleaseNotesDeps,
    config: ChangelogConfig,
    target: ReleaseNotesTarget
): Promise<string | undefined> {
    const changelogPath = packageChangelogPathFor(deps, config, target.name);
    if (changelogPath === undefined) {
        return undefined;
    }
    try {
        return extractReleaseNotes(await deps.fileManager.readFile(changelogPath), target);
    } catch (error: unknown) {
        if (isMissingFileError(error)) {
            return undefined;
        }
        throw error;
    }
}

async function recoverMissingReleaseNotes(
    deps: GitHubReleaseNotesDeps,
    config: ChangelogConfig,
    target: ReleaseNotesTarget
): Promise<string> {
    const releaseNotes = await readConfiguredReleaseNotes(deps, config, target);
    if (!hasReleaseNotes(releaseNotes)) {
        missingGitHubReleaseNotes(target);
    }
    return releaseNotes;
}

export async function collectGitHubReleaseNotes(
    deps: GitHubReleaseNotesDeps,
    config: ChangelogConfig,
    targets: readonly ReleaseNotesTarget[],
    changelog: GeneratedChangelog
): Promise<ReadonlyMap<string, string>> {
    const releaseNotesByPackageName = new Map(changelog.packageMarkdownByName);
    for (const target of targets) {
        if (!hasReleaseNotes(releaseNotesByPackageName.get(target.name))) {
            releaseNotesByPackageName.set(target.name, await recoverMissingReleaseNotes(deps, config, target));
        }
    }
    return releaseNotesByPackageName;
}
