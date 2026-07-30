import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { isDeclarationPath } from './type-script-declaration-paths.ts';
import type {
    DeclarationDiagnostic,
    DeclarationProject,
    DeclarationProjectsFactory,
    PackageFile
} from './type-script-declaration-project.ts';
import { reachableDeclarationPaths } from './type-script-declaration-reachability.ts';
import { declarationRootsFromManifest } from './type-script-declaration-roots.ts';

export type DeclarationMode = 'all' | 'exports-graph';

export type DeclarationIntegritySummarizer = (
    packageName: string,
    publishedPackage: Readonly<PublishedPackageWithManifest>,
    declarationMode: DeclarationMode
) => readonly string[];

export type DeclarationIntegrityDependencies = {
    readonly createDeclarationProjects: DeclarationProjectsFactory;
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

function checkedDeclarationPaths(
    project: DeclarationProject,
    declarationPaths: ReadonlySet<string>,
    rootPaths: ReadonlySet<string>,
    declarationMode: DeclarationMode
): ReadonlySet<string> {
    if (declarationMode === 'all') {
        return declarationPaths;
    }

    return reachableDeclarationPaths({
        declarationPaths,
        rootPaths,
        moduleSpecifiersOf: project.moduleSpecifiersOf
    });
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

    return function summarizeDeclarationIntegrity(packageName, publishedPackage, declarationMode) {
        const packageFiles = collectPackageFiles(publishedPackage);
        const declarationPaths = collectDeclarationPaths(packageFiles);
        const rootPaths = declarationRootsFromManifest(publishedPackage.manifestFile.content);

        return createDeclarationProjects(packageName, packageFiles).flatMap(function (project) {
            const checkedPaths = checkedDeclarationPaths(project, declarationPaths, rootPaths, declarationMode);

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
