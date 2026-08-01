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
    modeLabel: string
): DeclarationProject {
    return {
        modeLabel,

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

    function createProjectForMode(
        packageName: string,
        packageFiles: readonly PackageFile[],
        resolutionPackages: readonly ResolutionPackageFiles[],
        compilerMode: DeclarationCompilerMode
    ): DeclarationProject {
        const packageFolder = declarationProjectPackageFolder(packageResolutionBaseFolder, packageName);
        const project = new Project({
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
        const createdFilePaths = new Set<string>();

        addPackageFiles(project, packageName, packageFiles, createdFilePaths);
        for (const resolutionPackage of resolutionPackages) {
            addPackageFiles(
                project,
                resolutionPackage.packageName,
                resolutionPackage.packageFiles,
                createdFilePaths
            );
        }

        return createModeProject(project, packageFolder, compilerMode.label);
    }

    return function createDeclarationProjects(packageName, packageFiles, resolutionPackages) {
        return declarationCompilerModes().map(function (compilerMode) {
            return createProjectForMode(packageName, packageFiles, resolutionPackages, compilerMode);
        });
    };
}
