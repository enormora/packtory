import path from 'node:path';
import type { Project as _Project, SourceFile } from 'ts-morph';
import { packageManifestPathIn } from '../common/package-layout.ts';
import type { ModuleReference } from './source-file-references.ts';
import { analyzationOptionsToCompilerOptions, type AnalyzationOptions } from './typescript-compiler-options.ts';
import type { FileSystemAdapters } from './typescript-file-host.ts';

export type TypescriptProjectAnalyzerDependencies = {
    readonly Project: typeof _Project;
    readonly fileSystemAdapters: FileSystemAdapters;
    getReferencedModules: (
        sourceFile: Readonly<SourceFile>,
        packageJsonPath: string
    ) => readonly Readonly<ModuleReference>[];
};

export type TypescriptProject = {
    getReferencedModules: (containingSourceFilePath: string) => readonly Readonly<ModuleReference>[];
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
    const { fileSystemAdapters, Project, getReferencedModules } = dependencies;

    return {
        analyzeProject(folder, options) {
            const packageJsonPath = packageManifestPathIn(folder);
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
                getReferencedModules(containingSourceFilePath) {
                    const currentSourceFile = project.getSourceFile(containingSourceFilePath);

                    if (currentSourceFile === undefined) {
                        return [];
                    }

                    return getReferencedModules(currentSourceFile, packageJsonPath);
                },

                getProject() {
                    return project;
                }
            };
        }
    };
}
