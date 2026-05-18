import path from 'node:path';
import type { Project as _Project, SourceFile } from 'ts-morph';
import { analyzationOptionsToCompilerOptions, type AnalyzationOptions } from './typescript-compiler-options.ts';
import type { FileSystemAdapters } from './typescript-file-host.ts';

export type TypescriptProjectAnalyzerDependencies = {
    readonly Project: typeof _Project;
    readonly fileSystemAdapters: FileSystemAdapters;
    getReferencedSourceFiles: (sourceFile: Readonly<SourceFile>) => readonly Readonly<SourceFile>[];
};

export type TypescriptProject = {
    getReferencedSourceFilePaths: (containingSourceFilePath: string) => readonly string[];
    getProject: () => _Project;
};

export type TypescriptProjectAnalyzer = {
    analyzeProject: (folder: string, options: AnalyzationOptions) => TypescriptProject;
};

export function getSourcePathFromSourceFile(sourceFile: Readonly<SourceFile>): string {
    return sourceFile.getFilePath();
}

export function createTypescriptProjectAnalyzer(
    dependencies: TypescriptProjectAnalyzerDependencies
): TypescriptProjectAnalyzer {
    const { fileSystemAdapters, Project, getReferencedSourceFiles } = dependencies;

    return {
        analyzeProject(folder, options) {
            const project = new Project({
                compilerOptions: analyzationOptionsToCompilerOptions(options),
                fileSystem: fileSystemAdapters.withVirtualPackageJson(
                    options.resolveDeclarationFiles
                        ? fileSystemAdapters.fileSystemHostWithoutFilter
                        : fileSystemAdapters.fileSystemHostFilteringDeclarationFiles,
                    folder,
                    options.mainPackageJson
                )
            });

            const fileExtension = options.resolveDeclarationFiles ? '.d.ts' : '.js';
            const filesPattern = path.join(folder, `**/*${fileExtension}`);
            project.addSourceFilesAtPaths([filesPattern]);

            return {
                getReferencedSourceFilePaths(containingSourceFilePath) {
                    const currentSourceFile = project.getSourceFile(containingSourceFilePath);

                    if (currentSourceFile === undefined) {
                        return [];
                    }

                    return getReferencedSourceFiles(currentSourceFile).map(getSourcePathFromSourceFile);
                },

                getProject() {
                    return project;
                }
            };
        }
    };
}
