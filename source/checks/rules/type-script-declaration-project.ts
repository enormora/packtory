import path from 'node:path';
import { uniqueBy } from 'remeda';
import {
    ModuleKind,
    ModuleResolutionKind,
    ScriptKind,
    ScriptTarget,
    ts as typescript,
    type Diagnostic,
    type FileSystemHost,
    type Project as TypeScriptMorphProject,
    type SourceFile
} from 'ts-morph';
import { isPackageManifestRecord, parsePackageManifest } from './type-script-declaration-roots.ts';

export type PackageFile = {
    readonly filePath: string;
    readonly content: string;
};

export type ResolutionPackageFiles = {
    readonly packageName: string;
    readonly packageFiles: readonly PackageFile[];
};

export type DeclarationDiagnostic = {
    readonly declarationPath: string;
    readonly line: number;
    readonly code: number;
    readonly message: string;
};

export type DeclarationProject = {
    readonly modeLabel: string;
    readonly publicEntrypointPaths: readonly string[];
    readonly moduleSpecifiersOf: (declarationPath: string) => readonly string[];
    readonly listDiagnostics: () => readonly DeclarationDiagnostic[];
};

export type DeclarationProjectsFactory = (
    packageName: string,
    packageFiles: readonly PackageFile[],
    resolutionPackages: readonly ResolutionPackageFiles[]
) => readonly DeclarationProject[];

export type DeclarationProjectDependencies = {
    readonly Project: typeof TypeScriptMorphProject;
    readonly fileSystemHost: FileSystemHost;
    readonly packageResolutionBaseFolder: string;
};

type DeclarationCompilerMode = {
    readonly label: string;
    readonly module: ModuleKind;
    readonly moduleResolution: ModuleResolutionKind;
};

type SharedDeclarationProject = {
    readonly moduleSpecifiersOf: (filePath: string) => readonly string[];
    readonly modeLabel: string;
    readonly diagnostics: () => readonly DeclarationDiagnostic[];
};

function declarationCompilerModes(): readonly DeclarationCompilerMode[] {
    return [
        {
            label: 'node16-esm',
            module: ModuleKind.Node16,
            moduleResolution: ModuleResolutionKind.Node16
        },
        {
            label: 'bundler',
            module: ModuleKind.ESNext,
            moduleResolution: ModuleResolutionKind.Bundler
        }
    ];
}

function isPackageExportKey(key: string): boolean {
    return key === '.' || key.startsWith('./');
}

function hasConditionalRootExports(exportKeys: readonly string[]): boolean {
    return exportKeys.length > 0 && !exportKeys.some(isPackageExportKey);
}

function publicExportSubpaths(exportsField: unknown): readonly string[] {
    if (typeof exportsField === 'string' || Array.isArray(exportsField)) {
        return [ '.' ];
    }

    if (!isPackageManifestRecord(exportsField)) {
        return [];
    }

    const exportKeys = Object.keys(exportsField);
    const subpaths = exportKeys.filter(function (key) {
        return isPackageExportKey(key) && !key.includes('*') && exportsField[key] !== null;
    });
    if (subpaths.length > 0) {
        return subpaths;
    }

    return hasConditionalRootExports(exportKeys) ? [ '.' ] : [];
}

function publicEntrypointSpecifiers(packageName: string, manifestContent: string): readonly string[] {
    const manifest = parsePackageManifest(manifestContent);
    const exportSubpaths = publicExportSubpaths(manifest.exports);
    if (exportSubpaths.length > 0) {
        return exportSubpaths.map(function (subpath) {
            return subpath === '.' ? packageName : `${packageName}/${subpath.slice('./'.length)}`;
        });
    }

    return manifest.types !== undefined || manifest.typings !== undefined || manifest.main !== undefined
        ? [ packageName ]
        : [];
}

function importSource(specifiers: Iterable<string>): string {
    return Array
        .from(new Set(specifiers), function (specifier) {
            return `import ${JSON.stringify(specifier)};`;
        })
        .join('\n');
}

function publicEntrypointSource(packageName: string, packageFiles: readonly PackageFile[]): string {
    const manifestFile = packageFiles.find(function (packageFile) {
        return packageFile.filePath === 'package.json';
    });
    const specifiers = manifestFile === undefined ? [] : publicEntrypointSpecifiers(packageName, manifestFile.content);

    return importSource(specifiers);
}

function isJavaScriptPath(filePath: string): boolean {
    return /\.(?:cjs|js|mjs)$/u.test(filePath);
}

function isPackageImportSpecifier(specifier: string): boolean {
    return !specifier.startsWith('./') &&
        !specifier.startsWith('../') &&
        !specifier.startsWith('/') &&
        !specifier.startsWith('#') &&
        !specifier.startsWith('node:');
}

function javaScriptPackageImportSource(packageFiles: readonly PackageFile[]): string {
    const specifiers = packageFiles
        .filter(function (packageFile) {
            return isJavaScriptPath(packageFile.filePath);
        })
        .flatMap(function (packageFile) {
            return typescript.preProcessFile(packageFile.content).importedFiles;
        })
        .map(function (importedFile) {
            return importedFile.fileName;
        })
        .filter(isPackageImportSpecifier);

    return importSource(specifiers);
}

function moduleSpecifiersIn(sourceFile: Readonly<SourceFile>): readonly string[] {
    return [
        ...sourceFile.getImportDeclarations(),
        ...sourceFile.getExportDeclarations()
    ]
        .map(function (declaration) {
            return declaration.getModuleSpecifierValue();
        })
        .filter(function (specifier): specifier is string {
            return specifier !== undefined;
        });
}

function declarationProjectPackageFolder(baseFolder: string, packageName: string): string {
    return path.join(baseFolder, '.packtory-type-integrity', 'node_modules', packageName);
}

function declarationProjectPackageFilePath(packageFolder: string, relativeFilePath: string): string {
    return path.join(packageFolder, relativeFilePath);
}

function declarationProjectPackageRelativeFilePath(packageFolder: string, filePath: string): string {
    return path.relative(packageFolder, filePath).split(path.sep).join(path.posix.sep);
}

function toDeclarationDiagnostic(
    diagnostic: Readonly<Diagnostic>
): DeclarationDiagnostic | undefined {
    const sourceFile = diagnostic.getSourceFile();
    const start = diagnostic.getStart();
    if (sourceFile === undefined || start === undefined) {
        return undefined;
    }

    return {
        declarationPath: sourceFile.getFilePath(),
        line: sourceFile.getLineAndColumnAtPos(start).line,
        code: diagnostic.getCode(),
        message: typescript.flattenDiagnosticMessageText(diagnostic.compilerObject.messageText, '\n')
    };
}

function isDeclarationDiagnostic(diagnostic: DeclarationDiagnostic | undefined): diagnostic is DeclarationDiagnostic {
    return diagnostic !== undefined;
}

function createModeProject(
    mode: SharedDeclarationProject,
    packageFolder: string,
    publicEntrypointPaths: readonly string[]
): DeclarationProject {
    return {
        modeLabel: mode.modeLabel,
        publicEntrypointPaths,

        moduleSpecifiersOf(declarationPath) {
            return mode.moduleSpecifiersOf(declarationProjectPackageFilePath(packageFolder, declarationPath));
        },

        listDiagnostics() {
            return mode
                .diagnostics()
                .map(function (diagnostic) {
                    return {
                        ...diagnostic,
                        declarationPath: declarationProjectPackageRelativeFilePath(
                            packageFolder,
                            diagnostic.declarationPath
                        )
                    };
                });
        }
    };
}

export function createDeclarationProjectFactory(
    dependencies: DeclarationProjectDependencies
): DeclarationProjectsFactory {
    const { Project, fileSystemHost, packageResolutionBaseFolder } = dependencies;

    function addPackageFiles(
        project: TypeScriptMorphProject,
        packageName: string,
        packageFiles: readonly PackageFile[]
    ): void {
        const packageFolder = declarationProjectPackageFolder(packageResolutionBaseFolder, packageName);
        const sourceFiles = uniqueBy(
            packageFiles.map(function packageSourceFile(packageFile) {
                return {
                    ...packageFile,
                    filePath: declarationProjectPackageFilePath(packageFolder, packageFile.filePath)
                };
            }),
            function sourceFilePath(sourceFile) {
                return sourceFile.filePath;
            }
        );
        for (const packageFile of sourceFiles) {
            const { filePath } = packageFile;
            if (path.basename(packageFile.filePath) === 'package.json') {
                project.createSourceFile(filePath, packageFile.content, { scriptKind: ScriptKind.JSON });
            } else {
                project.createSourceFile(filePath, packageFile.content);
            }
        }
    }

    function createCompilerProject(compilerMode: DeclarationCompilerMode): TypeScriptMorphProject {
        return new Project({
            fileSystem: fileSystemHost,
            skipAddingFilesFromTsConfig: true,
            compilerOptions: {
                module: compilerMode.module,
                moduleResolution: compilerMode.moduleResolution,
                noEmit: true,
                resolveJsonModule: true,
                skipLibCheck: false,
                strict: true,
                target: ScriptTarget.ESNext
            }
        });
    }

    function generatedPackageFiles(packageName: string, packageFiles: readonly PackageFile[]): readonly PackageFile[] {
        return [
            {
                filePath: '.packtory-consumer-entrypoints.ts',
                content: publicEntrypointSource(packageName, packageFiles)
            },
            { filePath: '.packtory-javascript-imports.ts', content: javaScriptPackageImportSource(packageFiles) }
        ]
            .filter(function (file) {
                return file.content.length > 0;
            })
            .map(function (file) {
                return { filePath: file.filePath, content: `${file.content}\n` };
            });
    }

    function createProjectForMode(
        packages: readonly ResolutionPackageFiles[],
        compilerMode: DeclarationCompilerMode
    ): SharedDeclarationProject {
        const project = createCompilerProject(compilerMode);
        for (const { packageName, packageFiles } of packages) {
            const packageFolder = declarationProjectPackageFolder(packageResolutionBaseFolder, packageName);
            addPackageFiles(project, packageName, packageFiles);
            for (const generated of generatedPackageFiles(packageName, packageFiles)) {
                project.createSourceFile(
                    declarationProjectPackageFilePath(packageFolder, generated.filePath),
                    generated.content
                );
            }
        }
        let diagnostics: readonly DeclarationDiagnostic[] | null = null;
        return {
            moduleSpecifiersOf(filePath) {
                return moduleSpecifiersIn(project.getSourceFileOrThrow(filePath));
            },
            modeLabel: compilerMode.label,
            diagnostics() {
                diagnostics = diagnostics ??
                    project.getPreEmitDiagnostics().map(toDeclarationDiagnostic).filter(isDeclarationDiagnostic);
                return diagnostics;
            }
        };
    }

    const sessions = new WeakMap<readonly ResolutionPackageFiles[], readonly SharedDeclarationProject[]>();
    return function createDeclarationProjects(packageName, packageFiles, resolutionPackages) {
        const packageFolder = declarationProjectPackageFolder(packageResolutionBaseFolder, packageName);
        const shared = resolutionPackages.some(function (candidate) {
            return candidate.packageName === packageName && candidate.packageFiles === packageFiles;
        });
        const projects = (shared ? sessions.get(resolutionPackages) : undefined) ??
            declarationCompilerModes().map(function (compilerMode) {
                const packages = uniqueBy(
                    [ { packageName, packageFiles }, ...resolutionPackages ],
                    function (candidate) {
                        return candidate.packageName;
                    }
                );
                return createProjectForMode(packages, compilerMode);
            });
        if (shared) {
            sessions.set(resolutionPackages, projects);
        }
        return projects.map(function (mode) {
            return createModeProject(
                mode,
                packageFolder,
                generatedPackageFiles(packageName, packageFiles).map(function (file) {
                    return file.filePath;
                })
            );
        });
    };
}
