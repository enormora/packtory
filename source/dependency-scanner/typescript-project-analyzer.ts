import path from 'node:path';
import { ModuleKind, type Project as _Project, type SourceFile, ModuleResolutionKind } from 'ts-morph';

export type ModuleResolution = 'common-js' | 'module';

export type TypescriptProjectAnalyzerDependencies = {
    readonly Project: typeof _Project;
    getReferencedSourceFiles(sourceFile: Readonly<SourceFile>): readonly Readonly<SourceFile>[];
};

export type AnalyzationOptions = {
    readonly moduleResolution: ModuleResolution;
    readonly failOnCompileErrors: boolean;
    readonly resolveDeclarationFiles: boolean;
};

export type TypescriptProject = {
    getReferencedSourceFilePaths(containingSourceFilePath: string): readonly string[];
    getSourceFile(filePath: string): Readonly<SourceFile>;
};

export type TypescriptProjectAnalyzer = {
    analyzeProject(folder: string, options: AnalyzationOptions): TypescriptProject;
};

const declarationFileExtensionReplacements = new Map([
    ['.d.ts', '.js'],
    ['.d.cts', '.cjs'],
    ['.d.mts', '.mjs']
]);

function replaceDeclarationFileExtension(filePath: string): string {
    for (const replacement of declarationFileExtensionReplacements) {
        const [oldExtensions, newExtension] = replacement;

        if (filePath.endsWith(oldExtensions)) {
            const filePathWithoutExtension = filePath.slice(0, -oldExtensions.length);
            return `${filePathWithoutExtension}${newExtension}`;
        }
    }

    throw new Error(`Couldn’t handle file extension of declaration file "${filePath}"`);
}

export function getSourcePathFromSourceFile(
    sourceFile: Readonly<SourceFile>,
    resolveDeclarationFiles: boolean
): string {
    const filePath = sourceFile.getFilePath();

    if (sourceFile.isDeclarationFile() && !resolveDeclarationFiles) {
        return replaceDeclarationFileExtension(filePath);
    }

    return filePath;
}

export function createTypescriptProjectAnalyzer(
    dependencies: TypescriptProjectAnalyzerDependencies
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
                    module: options.moduleResolution === 'module' ? ModuleKind.Node16 : ModuleKind.CommonJS
                }
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

                    const referencedSourceFilePaths = getReferencedSourceFiles(currentSourceFile).map(
                        (dependencySourceFile) => {
                            return getSourcePathFromSourceFile(dependencySourceFile, options.resolveDeclarationFiles);
                        }
                    );

                    return referencedSourceFilePaths;
                },

                getSourceFile(filePath) {
                    const sourceFile = project.getSourceFile(filePath);

                    if (sourceFile === undefined) {
                        throw new Error(`Failed to find source file for "${filePath}"`);
                    }

                    return sourceFile;
                }
            };
        }
    };
}
