import path from 'node:path';
import {
    ModuleKind,
    ModuleResolutionKind,
    Project,
    ScriptTarget,
    ts as typescript,
    type Diagnostic,
    DiagnosticWithLocation,
    type SourceFile
} from 'ts-morph';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';

export type DeclarationMode = 'all' | 'exports-graph';

type PackageFile = {
    readonly filePath: string;
    readonly content: string;
};
type DeclarationCompilerMode = {
    readonly label: string;
    readonly module: ModuleKind;
    readonly moduleResolution: ModuleResolutionKind;
};
type KnownDeclarationExtension = {
    readonly javascriptExtension: string;
    readonly declarationExtensions: readonly string[];
};
type PendingDeclarationState = {
    readonly pending: readonly string[];
    readonly declarationPath: string | undefined;
};
type ReachableDeclarationContext = {
    readonly packageName: string;
    readonly project: Project;
    readonly declarationPaths: ReadonlySet<string>;
    readonly reachable: ReadonlySet<string>;
    readonly recordReachable: (declarationPath: string) => void;
};

const packageFolder = '/node_modules';
const javascriptExtension = '.js';
const esmJavascriptExtension = '.mjs';
const commonJsJavascriptExtension = '.cjs';

const declarationCompilerModes: readonly DeclarationCompilerMode[] = [
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
const knownDeclarationExtensions: readonly KnownDeclarationExtension[] = [
    {
        javascriptExtension,
        declarationExtensions: [ '.d.ts' ]
    },
    {
        javascriptExtension: esmJavascriptExtension,
        declarationExtensions: [ '.d.mts', '.d.ts' ]
    },
    {
        javascriptExtension: commonJsJavascriptExtension,
        declarationExtensions: [ '.d.cts', '.d.ts' ]
    }
];

function toPackageFilePath(packageName: string, filePath: string): string {
    return `${packageFolder}/${packageName}/${filePath}`;
}

function toPackageRelativeFilePath(packageName: string, filePath: string): string {
    return path.posix.relative(`${packageFolder}/${packageName}`, filePath);
}

function toCurrentPackageRelativeFilePath(filePath: string): string {
    return filePath.replace(/^\/node_modules\/[^/]+\//u, '');
}

function isDeclarationPath(filePath: string): boolean {
    return filePath.endsWith('.d.ts') || filePath.endsWith('.d.mts') || filePath.endsWith('.d.cts');
}

function collectPackageFiles(publishedPackage: PublishedPackageWithManifest): readonly PackageFile[] {
    return publishedPackage.contents.map(function (entry) {
        return {
            filePath: entry.fileDescription.targetFilePath,
            content: entry.fileDescription.content
        };
    });
}

function collectDeclarationPaths(packageFiles: readonly PackageFile[]): ReadonlySet<string> {
    return new Set(
        packageFiles
            .map(function (packageFile) {
                return packageFile.filePath;
            })
            .filter(isDeclarationPath)
    );
}

function findDeclarationPathsInValue(value: unknown): readonly string[] {
    if (typeof value === 'string') {
        return isDeclarationPath(value) ? [ value.replace(/^\.\//u, '') ] : [];
    }

    if (Array.isArray(value)) {
        return value.flatMap(findDeclarationPathsInValue);
    }

    if (typeof value === 'object' && value !== null) {
        return Object.values(value).flatMap(findDeclarationPathsInValue);
    }

    return [];
}

function parseManifestContent(manifestContent: string): Readonly<Record<string, unknown>> {
    const manifest: unknown = JSON.parse(manifestContent);
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        return {};
    }

    return Object.fromEntries(Object.entries(manifest));
}

function exportedDeclarationPaths(manifestContent: string): ReadonlySet<string> {
    const manifest = parseManifestContent(manifestContent);
    const exportsField = manifest.exports;
    const paths = [
        ...findDeclarationPathsInValue(exportsField),
        ...findDeclarationPathsInValue(manifest.types),
        ...findDeclarationPathsInValue(manifest.typings)
    ];
    return new Set(paths);
}

function stripKnownExtension(filePath: string, extension: string): string {
    return filePath.slice(0, -extension.length);
}

function declarationCandidatesForKnownExtension(resolvedPath: string): readonly string[] | undefined {
    const knownExtension = knownDeclarationExtensions.find(function (candidate) {
        return resolvedPath.endsWith(candidate.javascriptExtension);
    });
    if (knownExtension === undefined) {
        return undefined;
    }

    const basePath = stripKnownExtension(resolvedPath, knownExtension.javascriptExtension);
    return knownExtension.declarationExtensions.map(function (declarationExtension) {
        return `${basePath}${declarationExtension}`;
    });
}

function declarationCandidates(importerPath: string, specifier: string): readonly string[] {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        return [];
    }

    const resolvedPath = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier));
    const knownCandidates = declarationCandidatesForKnownExtension(resolvedPath);
    if (knownCandidates !== undefined) {
        return knownCandidates;
    }
    return [
        resolvedPath,
        `${resolvedPath}.d.ts`,
        `${resolvedPath}.d.mts`,
        `${resolvedPath}.d.cts`,
        `${resolvedPath}/index.d.ts`,
        `${resolvedPath}/index.d.mts`,
        `${resolvedPath}/index.d.cts`
    ];
}

function collectReferencedDeclarationPaths(
    sourceFile: SourceFile,
    declarationPaths: ReadonlySet<string>
): readonly string[] {
    const currentPackagePath = toCurrentPackageRelativeFilePath(sourceFile.getFilePath());
    const specifiers = [
        ...sourceFile.getImportDeclarations(),
        ...sourceFile.getExportDeclarations()
    ]
        .map(function (declaration) {
            return declaration.getModuleSpecifierValue();
        })
        .filter(function (specifier): specifier is string {
            return specifier !== undefined;
        });

    return specifiers.flatMap(function (specifier) {
        return declarationCandidates(currentPackagePath, specifier).filter(function (candidate) {
            return declarationPaths.has(candidate);
        });
    });
}

function takePendingDeclaration(
    pending: readonly string[],
    reachable: ReadonlySet<string>
): PendingDeclarationState {
    let remaining = pending;
    while (remaining.length > 0) {
        const [ declarationPath, ...nextRemaining ] = remaining;
        remaining = nextRemaining;
        if (declarationPath !== undefined && !reachable.has(declarationPath)) {
            return { pending: remaining, declarationPath };
        }
    }

    return { pending: remaining, declarationPath: undefined };
}

function pushUnvisitedDeclarations(
    reachable: ReadonlySet<string>,
    pending: readonly string[],
    referencedPaths: readonly string[]
): readonly string[] {
    return [
        ...pending,
        ...referencedPaths.filter(function (referencedPath) {
            return !reachable.has(referencedPath);
        })
    ];
}

function recordReachableDeclaration(
    context: ReachableDeclarationContext,
    declarationPath: string
): readonly string[] {
    context.recordReachable(declarationPath);
    const sourceFile = context.project.getSourceFileOrThrow(toPackageFilePath(context.packageName, declarationPath));
    return pushUnvisitedDeclarations(
        context.reachable,
        [],
        collectReferencedDeclarationPaths(sourceFile, context.declarationPaths)
    );
}

function reachableExportDeclarationPaths(
    packageName: string,
    manifestContent: string,
    project: Project,
    declarationPaths: ReadonlySet<string>
): ReadonlySet<string> {
    const reachable = new Set<string>();
    const pending = Array.from(exportedDeclarationPaths(manifestContent)).filter(function (declarationPath) {
        return declarationPaths.has(declarationPath);
    });
    const context: ReachableDeclarationContext = {
        packageName,
        project,
        declarationPaths,
        reachable,
        recordReachable(declarationPath) {
            reachable.add(declarationPath);
        }
    };

    let state = takePendingDeclaration(pending, reachable);
    while (state.declarationPath !== undefined) {
        const discoveredPaths = recordReachableDeclaration(context, state.declarationPath);
        state = takePendingDeclaration(
            pushUnvisitedDeclarations(reachable, state.pending, discoveredPaths),
            reachable
        );
    }

    return reachable;
}

function createDeclarationProject(
    publishedPackage: PublishedPackageWithManifest,
    compilerMode: DeclarationCompilerMode
): Project {
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

    project.createSourceFile(
        toPackageFilePath(publishedPackage.name, publishedPackage.manifestFile.filePath),
        publishedPackage.manifestFile.content
    );

    for (const packageFile of collectPackageFiles(publishedPackage)) {
        project.createSourceFile(toPackageFilePath(publishedPackage.name, packageFile.filePath), packageFile.content);
    }

    return project;
}

function flattenDiagnosticMessage(diagnostic: Diagnostic): string {
    return typescript.flattenDiagnosticMessageText(diagnostic.compilerObject.messageText, '\n');
}

function shouldReportDiagnostic(
    packageName: string,
    checkedDeclarationPaths: ReadonlySet<string>,
    diagnostic: DiagnosticWithLocation
): boolean {
    const sourceFile = diagnostic.getSourceFile();
    const declarationPath = toPackageRelativeFilePath(packageName, sourceFile.getFilePath());
    return checkedDeclarationPaths.has(declarationPath);
}

function isDiagnosticWithLocation(diagnostic: Diagnostic): diagnostic is DiagnosticWithLocation {
    return diagnostic instanceof DiagnosticWithLocation;
}

function summarizeDeclarationDiagnostic(
    packageName: string,
    compilerMode: DeclarationCompilerMode,
    diagnostic: DiagnosticWithLocation
): string {
    const sourceFile = diagnostic.getSourceFile();
    const sourcePath = toPackageRelativeFilePath(packageName, sourceFile.getFilePath());
    const start = diagnostic.getLineNumber();
    const location = `${sourcePath}:${start}`;
    return (
        `Package "${packageName}" failed TypeScript integrity in ${compilerMode.label}: ` +
        `${location} TS${diagnostic.getCode()}: ${flattenDiagnosticMessage(diagnostic)}`
    );
}

function declarationPathsForMode(
    packageName: string,
    publishedPackage: PublishedPackageWithManifest,
    project: Project,
    mode: DeclarationMode
): ReadonlySet<string> {
    const declarationPaths = collectDeclarationPaths(collectPackageFiles(publishedPackage));
    if (mode === 'all') {
        return declarationPaths;
    }

    return reachableExportDeclarationPaths(
        packageName,
        publishedPackage.manifestFile.content,
        project,
        declarationPaths
    );
}

export function summarizeDeclarationIntegrity(
    packageName: string,
    publishedPackage: PublishedPackageWithManifest,
    declarationMode: DeclarationMode
): readonly string[] {
    return declarationCompilerModes.flatMap(function (compilerMode) {
        const project = createDeclarationProject(publishedPackage, compilerMode);
        const checkedDeclarationPaths = declarationPathsForMode(
            packageName,
            publishedPackage,
            project,
            declarationMode
        );
        return project
            .getPreEmitDiagnostics()
            .filter(isDiagnosticWithLocation)
            .filter(function (diagnostic) {
                return shouldReportDiagnostic(packageName, checkedDeclarationPaths, diagnostic);
            })
            .map(function (diagnostic) {
                return summarizeDeclarationDiagnostic(packageName, compilerMode, diagnostic);
            });
    });
}
