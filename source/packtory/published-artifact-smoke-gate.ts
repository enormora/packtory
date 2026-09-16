import path from 'node:path';
import { isString } from 'remeda';
import {
    bundleRelativePath,
    installedDependenciesFolderName,
    packageManifestFilePath
} from '../common/package-layout.ts';
import { isRuntimeCodeTargetPath } from '../dead-code-eliminator/liveness/runtime-code.ts';
import {
    collectDeadCodeEliminationOutputIssues
} from '../dead-code-eliminator/invariants/output-invariants.ts';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';

type LinkDirectoryType = 'dir' | 'junction';

export type SmokeProbeInput = {
    readonly cwd: string;
    readonly specifier: string;
    readonly packageName: string;
    readonly targetFilePath: string;
    readonly timeoutMs: number;
};

type PublishedArtifactSmokeGateInput = {
    readonly analyzedBundle: AnalyzedBundle;
    readonly bundle: PublishedPackageWithManifest;
    readonly extraFiles: readonly FileDescription[];
    readonly dependencyBundles: readonly PublishedPackageWithManifest[];
};

export type PublishedArtifactSmokeGate = {
    readonly verify: (input: PublishedArtifactSmokeGateInput) => Promise<void>;
};

export type PublishedArtifactSmokeGateDependencies = {
    readonly collectContents: ArtifactsBuilder['collectContents'];
    readonly fileManager: Pick<FileManager, 'checkReadability' | 'setExecutable' | 'writeFile'>;
    readonly createTemporaryFolder: (prefix: string) => Promise<string>;
    readonly removeFolder: (folderPath: string) => Promise<void>;
    readonly linkDirectory: (sourcePath: string, targetPath: string, type: LinkDirectoryType) => Promise<void>;
    readonly runImportProbe: (input: SmokeProbeInput) => Promise<void>;
    readonly dependencyLinkType: LinkDirectoryType;
    readonly repositoryFolder: string;
};

type RuntimeExportTarget = {
    readonly specifier: string;
    readonly targetFilePath: string;
};

type BinTarget = {
    readonly name: string;
    readonly targetFilePath: string;
};

type SmokeTargets = {
    readonly runtimeExports: readonly RuntimeExportTarget[];
    readonly bins: readonly BinTarget[];
};

type StagedPackage = {
    readonly bundle: PublishedPackageWithManifest;
    readonly files: readonly FileDescription[];
};

const smokeProbeTimeoutMs = 3000;
const dotSlashLength = './'.length;
const dotSlashPrefix = './';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeArtifactPath(filePath: string): string {
    return path.posix.normalize(bundleRelativePath(filePath).split(path.sep).join(path.posix.sep));
}

function stripLeadingDotSlash(filePath: string): string {
    return filePath.startsWith(dotSlashPrefix) ? filePath.slice(dotSlashLength) : filePath;
}

function exportSpecifier(packageName: string, exportPath: string): string {
    return exportPath === '.' ? packageName : `${packageName}/${stripLeadingDotSlash(exportPath)}`;
}

function isPublicExportPath(exportPath: string): boolean {
    return exportPath === '.' || exportPath.startsWith('./');
}

function isRuntimeImportTarget(target: string): boolean {
    return isRuntimeCodeTargetPath(normalizeArtifactPath(target));
}

function runtimeStringTarget(target: unknown): string | undefined {
    if (!isString(target)) {
        return undefined;
    }
    const normalizedTarget = normalizeArtifactPath(stripLeadingDotSlash(target));
    return isRuntimeImportTarget(normalizedTarget) ? normalizedTarget : undefined;
}

function runtimeTargetFromConditionalExport(exportValue: Readonly<Record<string, unknown>>): string | undefined {
    return runtimeStringTarget(exportValue.import) ?? runtimeStringTarget(exportValue.default);
}

function runtimeTargetFromExportValue(exportValue: unknown): string | undefined {
    if (isString(exportValue)) {
        return runtimeStringTarget(exportValue);
    }
    return isRecord(exportValue) ? runtimeTargetFromConditionalExport(exportValue) : undefined;
}

function runtimeExportsFromRootConditions(
    packageName: string,
    exportsField: Readonly<Record<string, unknown>>
): readonly RuntimeExportTarget[] {
    const rootTarget = runtimeTargetFromExportValue(exportsField);
    return rootTarget === undefined
        ? []
        : [ { specifier: packageName, targetFilePath: normalizeArtifactPath(rootTarget) } ];
}

function runtimeExportsFromExportMap(
    packageName: string,
    exportsField: Readonly<Record<string, unknown>>
): readonly RuntimeExportTarget[] {
    return Object.entries(exportsField).flatMap(function ([ exportPath, exportValue ]): readonly RuntimeExportTarget[] {
        if (!isPublicExportPath(exportPath) || exportPath === `./${packageManifestFilePath}`) {
            return [];
        }
        const targetFilePath = runtimeTargetFromExportValue(exportValue);
        return targetFilePath === undefined
            ? []
            : [
                {
                    specifier: exportSpecifier(packageName, exportPath),
                    targetFilePath: normalizeArtifactPath(targetFilePath)
                }
            ];
    });
}

function runtimeExportsFromExportsField(
    packageName: string,
    exportsField: unknown
): readonly RuntimeExportTarget[] {
    if (isString(exportsField)) {
        const targetFilePath = runtimeStringTarget(exportsField);
        return targetFilePath === undefined ? [] : [ { specifier: packageName, targetFilePath } ];
    }
    if (!isRecord(exportsField)) {
        return [];
    }
    return Object.keys(exportsField).some(isPublicExportPath)
        ? runtimeExportsFromExportMap(packageName, exportsField)
        : runtimeExportsFromRootConditions(packageName, exportsField);
}

function binTargetsFromBinField(
    packageName: string,
    binField: unknown
): readonly BinTarget[] {
    if (isString(binField)) {
        return [ { name: packageName, targetFilePath: normalizeArtifactPath(binField) } ];
    }
    if (!isRecord(binField)) {
        return [];
    }
    return Object.entries(binField).flatMap(function ([ name, target ]): readonly BinTarget[] {
        return isString(target) ? [ { name, targetFilePath: normalizeArtifactPath(target) } ] : [];
    });
}

function smokeTargets(bundle: PublishedPackageWithManifest): SmokeTargets {
    return {
        runtimeExports: runtimeExportsFromExportsField(bundle.name, bundle.exportsField),
        bins: binTargetsFromBinField(bundle.name, bundle.binField)
    };
}

function artifactTargetPaths(files: readonly FileDescription[]): ReadonlySet<string> {
    return new Set(files.map(function (file) {
        return normalizeArtifactPath(file.filePath);
    }));
}

function collectTargetIssues(
    packageName: string,
    targetPaths: ReadonlySet<string>,
    targets: SmokeTargets
): readonly string[] {
    return [
        ...targets.runtimeExports.flatMap(function (target): readonly string[] {
            return targetPaths.has(target.targetFilePath)
                ? []
                : [
                    `Package "${packageName}" export "${target.specifier}" points to missing artifact target ` +
                    `"${target.targetFilePath}"`
                ];
        }),
        ...targets.bins.flatMap(function (target): readonly string[] {
            return targetPaths.has(target.targetFilePath)
                ? []
                : [
                    `Package "${packageName}" bin "${target.name}" points to missing artifact target ` +
                    `"${target.targetFilePath}"`
                ];
        })
    ];
}

function declaredDependencyNames(bundle: PublishedPackageWithManifest): ReadonlySet<string> {
    return new Set([
        ...Object.keys(bundle.packageJson.dependencies ?? {}),
        ...Object.keys(bundle.packageJson.peerDependencies ?? {})
    ]);
}

function installedDependencySourcePath(repositoryFolder: string, packageName: string): string {
    return path.join(repositoryFolder, installedDependenciesFolderName, packageName);
}

function inputFileDependencySearchFolders(repositoryFolder: string, inputFilePath: string): readonly string[] {
    const rootFolder = path.parse(inputFilePath).root;
    const normalizedRepositoryFolder = path.normalize(repositoryFolder);
    const folders: string[] = [];
    for (
        let currentFolder = path.dirname(inputFilePath);
        currentFolder !== rootFolder;
        currentFolder = path.dirname(currentFolder)
    ) {
        if (currentFolder === normalizedRepositoryFolder) {
            break;
        }
        folders.push(currentFolder);
    }
    return folders;
}

function bundleDependencySearchFolders(
    repositoryFolder: string,
    bundle: PublishedPackageWithManifest
): readonly string[] {
    return bundle.contents.flatMap(function (resource) {
        return inputFileDependencySearchFolders(repositoryFolder, resource.fileDescription.inputFilePath);
    });
}

function dependencySourcePathCandidates(
    repositoryFolder: string,
    bundles: readonly PublishedPackageWithManifest[],
    packageName: string
): readonly string[] {
    const candidatePaths = [
        installedDependencySourcePath(repositoryFolder, packageName),
        ...bundles.flatMap(function (bundle) {
            return bundleDependencySearchFolders(repositoryFolder, bundle).map(function (folderPath) {
                return path.join(folderPath, installedDependenciesFolderName, packageName);
            });
        })
    ];
    return candidatePaths.map(function (candidatePath) {
        return path.normalize(candidatePath);
    });
}

function installedDependencyDisplayPath(packageName: string): string {
    return path.posix.join(installedDependenciesFolderName, packageName);
}

function stagedPackageNames(input: PublishedArtifactSmokeGateInput): ReadonlySet<string> {
    return new Set([
        input.bundle.name,
        ...input.dependencyBundles.map(function (bundle) {
            return bundle.name;
        })
    ]);
}

function unstagedDependencyNames(
    bundle: PublishedPackageWithManifest,
    stagedNames: ReadonlySet<string>
): readonly string[] {
    return Array.from(declaredDependencyNames(bundle)).filter(function (dependencyName) {
        return !stagedNames.has(dependencyName);
    });
}

function unlinkedDependencyNames(
    bundle: PublishedPackageWithManifest,
    stagedNames: ReadonlySet<string>,
    linkedNames: ReadonlySet<string>
): readonly string[] {
    return unstagedDependencyNames(bundle, stagedNames).filter(function (dependencyName) {
        return !linkedNames.has(dependencyName);
    });
}

async function collectMissingInstalledDependencyIssues(
    dependencies: PublishedArtifactSmokeGateDependencies,
    bundles: readonly PublishedPackageWithManifest[],
    stagedNames: ReadonlySet<string>
): Promise<readonly string[]> {
    const issues: string[] = [];
    for (const bundle of bundles) {
        for (const dependencyName of unstagedDependencyNames(bundle, stagedNames)) {
            const sourcePaths = dependencySourcePathCandidates(dependencies.repositoryFolder, bundles, dependencyName);
            const readabilityResults = await Promise.all(sourcePaths.map(async function (sourcePath) {
                return await dependencies.fileManager.checkReadability(sourcePath);
            }));
            if (
                readabilityResults.every(function (readability) {
                    return !readability.isReadable;
                })
            ) {
                issues.push(
                    [
                        `Package "${bundle.name}" dependency "${dependencyName}" is not installed at`,
                        `"${installedDependencyDisplayPath(dependencyName)}"`
                    ]
                        .join(' ')
                );
            }
        }
    }
    return issues;
}

function packageFolderPath(temporaryFolder: string, packageName: string): string {
    return path.join(temporaryFolder, installedDependenciesFolderName, packageName);
}

async function installedDependencyLinkSourcePath(
    dependencies: PublishedArtifactSmokeGateDependencies,
    bundles: readonly PublishedPackageWithManifest[],
    packageName: string
): Promise<string> {
    const sourcePaths = dependencySourcePathCandidates(dependencies.repositoryFolder, bundles, packageName);
    for (const sourcePath of sourcePaths) {
        const readability = await dependencies.fileManager.checkReadability(sourcePath);
        if (readability.isReadable) {
            return sourcePath;
        }
    }
    return installedDependencySourcePath(dependencies.repositoryFolder, packageName);
}

async function linkInstalledDependencies(
    dependencies: PublishedArtifactSmokeGateDependencies,
    bundles: readonly PublishedPackageWithManifest[],
    temporaryFolder: string,
    stagedNames: ReadonlySet<string>
): Promise<void> {
    const linkedNames = new Set<string>();
    for (const bundle of bundles) {
        for (const dependencyName of unlinkedDependencyNames(bundle, stagedNames, linkedNames)) {
            const sourcePath = await installedDependencyLinkSourcePath(dependencies, bundles, dependencyName);
            await dependencies.linkDirectory(
                sourcePath,
                packageFolderPath(temporaryFolder, dependencyName),
                dependencies.dependencyLinkType
            );
            linkedNames.add(dependencyName);
        }
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function collectProbeIssues(
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
                timeoutMs: smokeProbeTimeoutMs
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

function formatSmokeGateIssues(packageName: string, issues: readonly string[]): string {
    return `Package "${packageName}" published artifact smoke check failed:\n${
        issues
            .map(function (issue) {
                return `- ${issue}`;
            })
            .join('\n')
    }`;
}

async function writePackageFiles(
    dependencies: PublishedArtifactSmokeGateDependencies,
    temporaryFolder: string,
    stagedPackage: StagedPackage
): Promise<void> {
    const packageFolder = packageFolderPath(temporaryFolder, stagedPackage.bundle.name);
    for (const file of stagedPackage.files) {
        const targetPath = path.join(packageFolder, normalizeArtifactPath(file.filePath));
        await dependencies.fileManager.writeFile(targetPath, file.content);
        if (file.isExecutable) {
            await dependencies.fileManager.setExecutable(targetPath, true);
        }
    }
}

async function verifyRuntimeExportsInTemporaryFolder(
    dependencies: PublishedArtifactSmokeGateDependencies,
    input: PublishedArtifactSmokeGateInput,
    temporaryFolder: string,
    currentPackageFiles: readonly FileDescription[]
): Promise<void> {
    await writePackageFiles(dependencies, temporaryFolder, { bundle: input.bundle, files: currentPackageFiles });
    for (const bundle of input.dependencyBundles) {
        await writePackageFiles(dependencies, temporaryFolder, {
            bundle,
            files: dependencies.collectContents(bundle, undefined, [])
        });
    }
    await linkInstalledDependencies(
        dependencies,
        [ input.bundle, ...input.dependencyBundles ],
        temporaryFolder,
        stagedPackageNames(input)
    );
    const probeIssues = await collectProbeIssues(
        dependencies,
        input.bundle.name,
        temporaryFolder,
        smokeTargets(input.bundle).runtimeExports
    );
    if (probeIssues.length > 0) {
        throw new Error(formatSmokeGateIssues(input.bundle.name, probeIssues));
    }
}

async function writeStagedPackages(
    dependencies: PublishedArtifactSmokeGateDependencies,
    input: PublishedArtifactSmokeGateInput,
    currentPackageFiles: readonly FileDescription[]
): Promise<void> {
    const temporaryFolder = await dependencies.createTemporaryFolder('packtory-smoke-');
    try {
        await verifyRuntimeExportsInTemporaryFolder(dependencies, input, temporaryFolder, currentPackageFiles);
    } finally {
        await dependencies.removeFolder(temporaryFolder);
    }
}

function collectInvariantIssues(input: PublishedArtifactSmokeGateInput): readonly string[] {
    return collectDeadCodeEliminationOutputIssues([ input.analyzedBundle ]).map(function (issue) {
        return `Dead code elimination output invariant failed: ${issue}`;
    });
}

export function createPublishedArtifactSmokeGate(
    dependencies: PublishedArtifactSmokeGateDependencies
): PublishedArtifactSmokeGate {
    async function verify(input: PublishedArtifactSmokeGateInput): Promise<void> {
        const files = dependencies.collectContents(input.bundle, undefined, input.extraFiles);
        const targets = smokeTargets(input.bundle);
        const stagedNames = stagedPackageNames(input);
        const issues = [
            ...collectInvariantIssues(input),
            ...collectTargetIssues(input.bundle.name, artifactTargetPaths(files), targets),
            ...await collectMissingInstalledDependencyIssues(
                dependencies,
                [ input.bundle, ...input.dependencyBundles ],
                stagedNames
            )
        ];

        if (issues.length > 0) {
            throw new Error(formatSmokeGateIssues(input.bundle.name, issues));
        }

        if (targets.runtimeExports.length > 0) {
            await writeStagedPackages(dependencies, input, files);
        }
    }

    return { verify };
}
