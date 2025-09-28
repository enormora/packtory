import path from 'node:path';
import {
    ModuleKind,
    type Project as _Project,
    type SourceFile,
    ModuleResolutionKind,
    type CompilerOptions
} from 'ts-morph';
import type { FileSystemAdapters } from './typescript-file-host.ts';

export type ModuleResolution = 'common-js' | 'module';

export type TypescriptProjectAnalyzerDependencies = {
    readonly Project: typeof _Project;
    readonly fileSystemAdapters: FileSystemAdapters;
    getReferencedSourceFiles: (sourceFile: Readonly<SourceFile>) => readonly Readonly<SourceFile>[];
};

export type AnalyzationOptions = {
    readonly moduleResolution: ModuleResolution;
    readonly failOnCompileErrors: boolean;
    readonly resolveDeclarationFiles: boolean;
};

export type TypescriptProject = {
    getReferencedSourceFilePaths: (containingSourceFilePath: string) => readonly string[];
    getSourceFile: (filePath: string) => SourceFile;
    getProject: () => _Project;
};

export type TypescriptProjectAnalyzer = {
    analyzeProject: (folder: string, options: AnalyzationOptions) => TypescriptProject;
};

export function getSourcePathFromSourceFile(sourceFile: Readonly<SourceFile>): string {
    const filePath = sourceFile.getFilePath();

    return filePath;
}

function analyzationOptionsToCompilerOptions(options: AnalyzationOptions): CompilerOptions {
    const { moduleResolution, resolveDeclarationFiles } = options;

    const compilerOptions: CompilerOptions = {
        moduleResolution: ModuleResolutionKind.Node16,
        esModuleInterop: true,
        maxNodeModuleJsDepth: 1,
        noEmit: true,
        allowJs: true,
        noLib: true,
        skipLibCheck: true,
        module: moduleResolution === 'module' ? ModuleKind.Node16 : ModuleKind.CommonJS
    };

    if (!resolveDeclarationFiles) {
        compilerOptions.types = [];
        compilerOptions.typeRoots = [];
    }

    return compilerOptions;
}

export function createTypescriptProjectAnalyzer(
    dependencies: TypescriptProjectAnalyzerDependencies
): TypescriptProjectAnalyzer {
    const { fileSystemAdapters, Project, getReferencedSourceFiles } = dependencies;

    return {
        analyzeProject(folder, options) {
            const project = new Project({
                compilerOptions: analyzationOptionsToCompilerOptions(options),
                fileSystem: options.resolveDeclarationFiles
                    ? fileSystemAdapters.fileSystemHostWithoutFilter
                    : fileSystemAdapters.fileSystemHostFilteringDeclarationFiles
            });

            const fileExtension = options.resolveDeclarationFiles ? '.d.ts' : '.js';
            const filesPattern = path.join(folder, `**/*${fileExtension}`);
            project.addSourceFilesAtPaths([filesPattern]);

            if (options.failOnCompileErrors) {
                const diagnostics = project.getPreEmitDiagnostics();

                if (diagnostics.length > 0) {
                    throw new Error('Failed to analyze source files');
                }
            }

            return {
                getReferencedSourceFilePaths(containingSourceFilePath) {
                    const currentSourceFile = project.getSourceFile(containingSourceFilePath);

                    if (currentSourceFile === undefined) {
                        return [];
                    }

                    const referencedSourceFilePaths =
                        getReferencedSourceFiles(currentSourceFile).map(getSourcePathFromSourceFile);

                    return referencedSourceFilePaths;
                },

                getSourceFile(filePath) {
                    const sourceFile = project.getSourceFile(filePath);

                    if (sourceFile === undefined) {
                        throw new Error(`Failed to find source file for "${filePath}"`);
                    }

                    return sourceFile;
                },

                getProject() {
                    return project;
                }
            };
        }
    };
}
