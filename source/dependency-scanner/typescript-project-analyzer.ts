import type { Project as _Project, SourceFile } from 'ts-morph';
import { isDeclarationCompanionFilePath } from '../common/declaration-companion-paths.ts';
import { packageManifestPathIn } from '../common/package-layout.ts';
import type { ModuleReference } from './source-file-references.ts';
import { analyzationOptionsToCompilerOptions, type AnalyzationOptions } from './typescript-compiler-options.ts';
import type { FileSystemAdapters } from './typescript-file-host.ts';

export type TypescriptProjectAnalyzerDependencies = {
    readonly Project: typeof _Project;
    readonly fileSystemAdapters: FileSystemAdapters;
    getReferencedModules: (
        sourceFile: Readonly<SourceFile>,
        packageManifestPath: string
    ) => readonly Readonly<ModuleReference>[];
};

export type TypescriptProject = {
    includeEntryFiles: (entryFilePaths: readonly string[]) => void;
    getReferencedModules: (containingInputFilePath: string) => readonly Readonly<ModuleReference>[];
    getProject: () => _Project;
};

export type TypescriptProjectAnalyzer = {
    analyzeProject: (folder: string, options: AnalyzationOptions) => TypescriptProject;
};

export function createTypescriptProjectAnalyzer(
    dependencies: TypescriptProjectAnalyzerDependencies
): TypescriptProjectAnalyzer {
    const { fileSystemAdapters, Project, getReferencedModules } = dependencies;

    return {
        analyzeProject(folder, options) {
            const packageManifestPath = packageManifestPathIn(folder);
            const project = new Project({
                compilerOptions: analyzationOptionsToCompilerOptions(options),
                fileSystem: fileSystemAdapters.withVirtualPackageManifest(
                    options.resolveDeclarationFiles
                        ? fileSystemAdapters.fileSystemHostWithoutFilter
                        : fileSystemAdapters.fileSystemHostFilteringDeclarationFiles,
                    folder,
                    options.mainPackageManifest
                )
            });

            return {
                includeEntryFiles(entryFilePaths) {
                    for (const entryFilePath of entryFilePaths) {
                        project.addSourceFileAtPathIfExists(entryFilePath);
                    }
                },
                getReferencedModules(containingInputFilePath) {
                    if (options.resolveDeclarationFiles && !isDeclarationCompanionFilePath(containingInputFilePath)) {
                        return [];
                    }
                    const currentSourceFile = project.getSourceFile(containingInputFilePath) ??
                        project.addSourceFileAtPathIfExists(containingInputFilePath);

                    if (currentSourceFile === undefined) {
                        return [];
                    }

                    return getReferencedModules(currentSourceFile, packageManifestPath);
                },

                getProject() {
                    return project;
                }
            };
        }
    };
}
