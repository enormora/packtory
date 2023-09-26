import path from 'node:path';
import { ModuleKind, Project as _Project, SourceFile, ModuleResolutionKind } from 'ts-morph';

export type ModuleResolution = 'module' | 'common-js';

export interface TypescriptProjectAnalyzerDependencies {
    readonly Project: typeof _Project;
    getReferencedSourceFiles(sourceFile: SourceFile): SourceFile[];
}

export interface AnalyzationOptions {
    readonly moduleResolution: ModuleResolution;
    readonly failOnCompileErrors: boolean;
    readonly resolveDeclarationFiles: boolean;
}

export interface TypescriptProject {
    getReferencedSourceFilePaths(containingSourceFilePath: string): string[];
    getSourceFile(filePath: string): SourceFile;
}

export interface TypescriptProjectAnalyzer {
    analyzeProject(folder: string, options: AnalyzationOptions): TypescriptProject;
}

const declartionFileExtensionReplacements = new Map([
    ['.d.ts', '.js'],
    ['.d.cts', '.cjs'],
    ['.d.mts', '.mjs'],
]);

function replaceDeclarationFileExtension(filePath: string): string {
    for (const replacement of declartionFileExtensionReplacements) {
        const [oldExtensions, newExtension] = replacement;

        if (filePath.endsWith(oldExtensions)) {
            const filePathWithoutExtension = filePath.slice(0, -oldExtensions.length);
            return `${filePathWithoutExtension}${newExtension}`;
        }
    }

    throw new Error(`Couldn’t handle file extension of declartion file "${filePath}"`);
}

export function getSourcePathFromSourceFile(sourceFile: SourceFile, resolveDeclarationFiles: boolean): string {
    const filePath = sourceFile.getFilePath();

    if (sourceFile.isDeclarationFile() && !resolveDeclarationFiles) {
        return replaceDeclarationFileExtension(filePath);
    }

    return filePath;
}

export function createTypescriptProjectAnalyzer(
    dependencies: TypescriptProjectAnalyzerDependencies,
): TypescriptProjectAnalyzer {
    const { Project, getReferencedSourceFiles } = dependencies;

    return {
        analyzeProject(folder, options) {
            const project = new Project({
                compilerOptions: {
                    moduleResolution: ModuleResolutionKind.Node16,
                    esModuleInterop: true,
                    maxNodeModuleJsDepth: 1,
                    noEmit: true,
                    allowJs: true,
                    module: options.moduleResolution === 'module' ? ModuleKind.Node16 : ModuleKind.CommonJS,
                },
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

                    if (!currentSourceFile) {
                        return [];
                    }

                    const referencedSourceFilePaths = getReferencedSourceFiles(currentSourceFile).map(
                        (dependencySourceFile) => {
                            return getSourcePathFromSourceFile(dependencySourceFile, options.resolveDeclarationFiles);
                        },
                    );

                    return referencedSourceFilePaths;
                },

                getSourceFile(filePath) {
                    const sourceFile = project.getSourceFile(filePath);

                    if (!sourceFile) {
                        throw new Error(`Failed to find source file for "${filePath}"`);
                    }

                    return sourceFile;
                },
            };
        },
    };
}
