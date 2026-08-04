import path from 'node:path';
import {
    ModuleKind,
    ModuleResolutionKind,
    ScriptKind,
    ScriptTarget,
    ts as typescript,
    type Diagnostic,
    type FileSystemHost,
    type Project as TSMorphProject,
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
    readonly Project: typeof TSMorphProject;
    readonly fileSystemHost: FileSystemHost;
    readonly packageResolutionBaseFolder: string;
};

type DeclarationCompilerMode = {
    readonly label: string;
    readonly module: ModuleKind;
    readonly moduleResolution: ModuleResolutionKind;
};

type CreatedFilePathSet = {
    readonly add: (filePath: string) => unknown;
    readonly has: (filePath: string) => boolean;
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
    packageFolder: string,
    diagnostic: Readonly<Diagnostic>
): DeclarationDiagnostic | undefined {
    const sourceFile = diagnostic.getSourceFile();
    const start = diagnostic.getStart();
    if (sourceFile === undefined || start === undefined) {
        return undefined;
    }

    return {
        declarationPath: declarationProjectPackageRelativeFilePath(packageFolder, sourceFile.getFilePath()),
        line: sourceFile.getLineAndColumnAtPos(start).line,
        code: diagnostic.getCode(),
        message: typescript.flattenDiagnosticMessageText(diagnostic.compilerObject.messageText, '\n')
    };
}

function isDeclarationDiagnostic(diagnostic: DeclarationDiagnostic | undefined): diagnostic is DeclarationDiagnostic {
    return diagnostic !== undefined;
}

function createModeProject(
    project: Readonly<TSMorphProject>,
    packageFolder: string,
    modeLabel: string,
    publicEntrypointPaths: readonly string[]
): DeclarationProject {
    return {
        modeLabel,
        publicEntrypointPaths,

        moduleSpecifiersOf(declarationPath) {
            return moduleSpecifiersIn(
                project.getSourceFileOrThrow(declarationProjectPackageFilePath(packageFolder, declarationPath))
            );
        },

        listDiagnostics() {
            return project
                .getPreEmitDiagnostics()
                .map(function (diagnostic) {
                    return toDeclarationDiagnostic(packageFolder, diagnostic);
                })
                .filter(isDeclarationDiagnostic);
        }
    };
}

export function createDeclarationProjectFactory(
    dependencies: DeclarationProjectDependencies
): DeclarationProjectsFactory {
    const { Project, fileSystemHost, packageResolutionBaseFolder } = dependencies;

    function addPackageFiles(
        project: TSMorphProject,
        packageName: string,
        packageFiles: readonly PackageFile[],
        createdFilePaths: CreatedFilePathSet
    ): void {
        const packageFolder = declarationProjectPackageFolder(packageResolutionBaseFolder, packageName);
        for (const packageFile of packageFiles) {
            const filePath = declarationProjectPackageFilePath(packageFolder, packageFile.filePath);
            if (!createdFilePaths.has(filePath)) {
                createdFilePaths.add(filePath);
                if (path.basename(packageFile.filePath) === 'package.json') {
                    project.createSourceFile(filePath, packageFile.content, { scriptKind: ScriptKind.JSON });
                } else {
                    project.createSourceFile(filePath, packageFile.content);
                }
            }
        }
    }

    function createCompilerProject(compilerMode: DeclarationCompilerMode): TSMorphProject {
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

    function addGeneratedFile(
        project: TSMorphProject,
        packageFolder: string,
        filePath: string,
        source: string
    ): readonly string[] {
        if (source.length === 0) {
            return [];
        }

        project.createSourceFile(
            declarationProjectPackageFilePath(packageFolder, filePath),
            `${source}\n`
        );
        return [ filePath ];
    }

    function createProjectForMode(
        packageName: string,
        packageFiles: readonly PackageFile[],
        resolutionPackages: readonly ResolutionPackageFiles[],
        compilerMode: DeclarationCompilerMode
    ): DeclarationProject {
        const packageFolder = declarationProjectPackageFolder(packageResolutionBaseFolder, packageName);
        const project = createCompilerProject(compilerMode);
        const createdFilePaths = new Set<string>();

        addPackageFiles(project, packageName, packageFiles, createdFilePaths);
        const publicEntrypointPaths = [
            ...addGeneratedFile(
                project,
                packageFolder,
                '.packtory-consumer-entrypoints.ts',
                publicEntrypointSource(packageName, packageFiles)
            ),
            ...addGeneratedFile(
                project,
                packageFolder,
                '.packtory-javascript-imports.ts',
                javaScriptPackageImportSource(packageFiles)
            )
        ];
        for (const resolutionPackage of resolutionPackages) {
            addPackageFiles(
                project,
                resolutionPackage.packageName,
                resolutionPackage.packageFiles,
                createdFilePaths
            );
        }

        return createModeProject(project, packageFolder, compilerMode.label, publicEntrypointPaths);
    }

    return function createDeclarationProjects(packageName, packageFiles, resolutionPackages) {
        return declarationCompilerModes().map(function (compilerMode) {
            return createProjectForMode(packageName, packageFiles, resolutionPackages, compilerMode);
        });
    };
}
