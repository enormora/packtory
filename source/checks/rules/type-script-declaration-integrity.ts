import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { isDeclarationPath } from './type-script-declaration-paths.ts';
import type {
    DeclarationDiagnostic,
    DeclarationProject,
    DeclarationProjectsFactory,
    PackageFile,
    ResolutionPackageFiles
} from './type-script-declaration-project.ts';
import { reachableDeclarationPaths } from './type-script-declaration-reachability.ts';
import { declarationRootsFromManifest } from './type-script-declaration-roots.ts';

export type DeclarationMode = 'all' | 'exports-graph';

export type DeclarationIntegritySummarizer = (
    packageName: string,
    publishedPackage: Readonly<PublishedPackageWithManifest>,
    declarationMode: DeclarationMode,
    resolutionPackages: ReadonlyMap<string, PublishedPackageWithManifest>
) => readonly string[];

export type DeclarationIntegrityDependencies = {
    readonly createDeclarationProjects: DeclarationProjectsFactory;
};

type CheckedDeclarationPathInput = {
    readonly project: DeclarationProject;
    readonly declarationPaths: ReadonlySet<string>;
    readonly rootPaths: ReadonlySet<string>;
    readonly declarationMode: DeclarationMode;
};

function collectPackageFiles(publishedPackage: Readonly<PublishedPackageWithManifest>): readonly PackageFile[] {
    return [
        {
            filePath: publishedPackage.manifestFile.filePath,
            content: publishedPackage.manifestFile.content
        },
        ...publishedPackage.contents.map(function (entry) {
            return {
                filePath: entry.fileDescription.targetFilePath,
                content: entry.fileDescription.content
            };
        })
    ];
}

function collectDeclarationPaths(packageFiles: readonly PackageFile[]): ReadonlySet<string> {
    return new Set(
        packageFiles
            .map(function (packageFile) {
                return packageFile.filePath;
            })
            .filter(isDeclarationPath)
    );
}

type PackageFileCollector = (publishedPackage: PublishedPackageWithManifest) => readonly PackageFile[];

function collectResolutionPackageFiles(
    publishedPackages: ReadonlyMap<string, PublishedPackageWithManifest>,
    packageFilesFor: PackageFileCollector
): readonly ResolutionPackageFiles[] {
    return Array
        .from(publishedPackages, function ([ candidateName, publishedPackage ]) {
            return {
                packageName: candidateName,
                packageFiles: packageFilesFor(publishedPackage)
            };
        });
}

function checkedDeclarationPaths(input: CheckedDeclarationPathInput): ReadonlySet<string> {
    const { project, declarationPaths, rootPaths, declarationMode } = input;
    const { publicEntrypointPaths } = project;
    if (declarationMode === 'all') {
        return new Set([ ...declarationPaths, ...publicEntrypointPaths ]);
    }

    return new Set([
        ...reachableDeclarationPaths({
            declarationPaths,
            rootPaths,
            moduleSpecifiersOf: project.moduleSpecifiersOf
        }),
        ...publicEntrypointPaths
    ]);
}

function formatDeclarationDiagnostic(
    packageName: string,
    modeLabel: string,
    diagnostic: Readonly<DeclarationDiagnostic>
): string {
    return (
        `Package "${packageName}" failed TypeScript integrity in ${modeLabel}: ` +
        `${diagnostic.declarationPath}:${diagnostic.line} TS${diagnostic.code}: ${diagnostic.message}`
    );
}

export function createDeclarationIntegritySummarizer(
    dependencies: DeclarationIntegrityDependencies
): DeclarationIntegritySummarizer {
    const { createDeclarationProjects } = dependencies;
    const filesByPackage = new WeakMap<PublishedPackageWithManifest, readonly PackageFile[]>();
    function packageFilesFor(publishedPackage: PublishedPackageWithManifest): readonly PackageFile[] {
        const files = filesByPackage.get(publishedPackage) ?? collectPackageFiles(publishedPackage);
        filesByPackage.set(publishedPackage, files);
        return files;
    }
    const resolutionFiles = new WeakMap<
        ReadonlyMap<string, PublishedPackageWithManifest>,
        readonly ResolutionPackageFiles[]
    >();

    return function summarizeDeclarationIntegrity(packageName, publishedPackage, declarationMode, resolutionPackages) {
        const resolutionPackageFiles = resolutionFiles.get(resolutionPackages) ??
            collectResolutionPackageFiles(resolutionPackages, packageFilesFor);
        resolutionFiles.set(resolutionPackages, resolutionPackageFiles);
        const packageFiles = packageFilesFor(publishedPackage);
        const declarationPaths = collectDeclarationPaths(packageFiles);
        const rootPaths = declarationRootsFromManifest(publishedPackage.manifestFile.content);

        return createDeclarationProjects(packageName, packageFiles, resolutionPackageFiles).flatMap(function (project) {
            const checkedPaths = checkedDeclarationPaths({
                project,
                declarationPaths,
                rootPaths,
                declarationMode
            });

            return project
                .listDiagnostics()
                .filter(function (diagnostic) {
                    return checkedPaths.has(diagnostic.declarationPath);
                })
                .map(function (diagnostic) {
                    return formatDeclarationDiagnostic(packageName, project.modeLabel, diagnostic);
                });
        });
    };
}
