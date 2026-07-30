import {
    ModuleKind,
    ModuleResolutionKind,
    ScriptTarget,
    ts as typescript,
    type Diagnostic,
    type Project as TSMorphProject,
    type SourceFile
} from 'ts-morph';
import { installedPackageFilePath, packageRelativeFilePath } from '../../common/package-layout.ts';

export type PackageFile = {
    readonly filePath: string;
    readonly content: string;
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
    packageFiles: readonly PackageFile[]
) => readonly DeclarationProject[];

export type DeclarationProjectDependencies = {
    readonly Project: typeof TSMorphProject;
};

type DeclarationCompilerMode = {
    readonly label: string;
    readonly module: ModuleKind;
    readonly moduleResolution: ModuleResolutionKind;
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

function toDeclarationDiagnostic(
    packageName: string,
    diagnostic: Readonly<Diagnostic>
): DeclarationDiagnostic | undefined {
    const sourceFile = diagnostic.getSourceFile();
    const start = diagnostic.getStart();
    if (sourceFile === undefined || start === undefined) {
        return undefined;
    }

    return {
        declarationPath: packageRelativeFilePath(packageName, sourceFile.getFilePath()),
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
    packageName: string,
    modeLabel: string
): DeclarationProject {
    return {
        modeLabel,

        moduleSpecifiersOf(declarationPath) {
            return moduleSpecifiersIn(
                project.getSourceFileOrThrow(installedPackageFilePath(packageName, declarationPath))
            );
        },

        listDiagnostics() {
            return project
                .getPreEmitDiagnostics()
                .map(function (diagnostic) {
                    return toDeclarationDiagnostic(packageName, diagnostic);
                })
                .filter(isDeclarationDiagnostic);
        }
    };
}

export function createDeclarationProjectFactory(
    dependencies: DeclarationProjectDependencies
): DeclarationProjectsFactory {
    const { Project } = dependencies;

    function createProjectForMode(
        packageName: string,
        packageFiles: readonly PackageFile[],
        compilerMode: DeclarationCompilerMode
    ): DeclarationProject {
        const project = new Project({
            useInMemoryFileSystem: true,
            skipAddingFilesFromTsConfig: true,
            compilerOptions: {
                module: compilerMode.module,
                moduleResolution: compilerMode.moduleResolution,
                noEmit: true,
                skipLibCheck: false,
                strict: true,
                target: ScriptTarget.ESNext
            }
        });

        for (const packageFile of packageFiles) {
            project.createSourceFile(installedPackageFilePath(packageName, packageFile.filePath), packageFile.content);
        }

        return createModeProject(project, packageName, compilerMode.label);
    }

    return function createDeclarationProjects(packageName, packageFiles) {
        return declarationCompilerModes().map(function (compilerMode) {
            return createProjectForMode(packageName, packageFiles, compilerMode);
        });
    };
}
