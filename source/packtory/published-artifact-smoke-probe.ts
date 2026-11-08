import { errorMessage } from '../common/error-normalization.ts';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { CreateProject } from '../dead-code-eliminator/load-bundle.ts';

type LinkDirectoryType = 'dir' | 'junction';

export type SmokeProbeInput = {
    readonly cwd: string;
    readonly specifier: string;
    readonly packageName: string;
    readonly targetFilePath: string;
    readonly timeoutMilliseconds: number;
};

export type PublishedArtifactSmokeGateDependencies = {
    readonly createProject: CreateProject;
    readonly collectContents: ArtifactsBuilder['collectContents'];
    readonly fileManager: Pick<FileManager, 'checkReadability' | 'setExecutable' | 'writeFile'>;
    readonly createTemporaryFolder: (prefix: string) => Promise<string>;
    readonly removeFolder: (folderPath: string) => Promise<void>;
    readonly linkDirectory: (sourcePath: string, targetPath: string, type: LinkDirectoryType) => Promise<void>;
    readonly runImportProbe: (input: SmokeProbeInput) => Promise<void>;
    readonly dependencyLinkType: LinkDirectoryType;
    readonly repositoryFolder: string;
};

export type RuntimeExportTarget = {
    readonly specifier: string;
    readonly targetFilePath: string;
};

const importProbeTimeoutMilliseconds = 10_000;

export async function collectProbeIssues(
    dependencies: PublishedArtifactSmokeGateDependencies,
    packageName: string,
    temporaryFolder: string,
    targets: readonly RuntimeExportTarget[]
): Promise<readonly string[]> {
    const issues: string[] = [];
    for (const target of targets) {
        try {
            await dependencies.runImportProbe({
                cwd: temporaryFolder,
                specifier: target.specifier,
                packageName,
                targetFilePath: target.targetFilePath,
                timeoutMilliseconds: importProbeTimeoutMilliseconds
            });
        } catch (error: unknown) {
            issues.push(
                [
                    `Package "${packageName}" export "${target.specifier}" target`,
                    `"${target.targetFilePath}" failed import: ${errorMessage(error)}`
                ]
                    .join(' ')
            );
        }
    }
    return issues;
}
