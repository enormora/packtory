import path from 'node:path';
import { isDefined } from 'remeda';
import { ts as typescript } from 'ts-morph';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import type { ExplicitPackageSurface, ImplicitPackageSurface } from '../package-surface/surface.ts';
import { rootSourceFilePaths } from '../package-surface/package-surface-index.ts';
import { getPublicModuleSpecifierForSourcePath } from '../package-surface/public-specifiers.ts';
import { getRoot } from '../package-surface/root-registry.ts';
import { toPackageSpecifier } from '../package-surface/specifier-syntax.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';

export type ImportPathReplacement = {
    readonly emittedSpecifier: string;
    readonly packageName: string;
};

export type ImportPathReplacementRequest = {
    readonly sourceFilePath: string;
    readonly requiredExportNames: ReadonlySet<string>;
    readonly requiresNamespaceExport: boolean;
};

export type Replacements = {
    readonly importPathReplacements: ReadonlyMap<string, ImportPathReplacement>;
    readonly bundleDependencies: readonly string[];
    readonly substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
};

export function ownsSourcePath(file: string, bundle: BundleSubstitutionSource): boolean {
    return bundle.contents.some(function (content) {
        return content.fileDescription.sourceFilePath === file;
    });
}

function needsImportReplacement(file: string): boolean {
    return !file.endsWith('.map');
}

type ContentLookup = {
    readonly contentBySourcePath: ReadonlyMap<string, BundleSubstitutionSource['contents'][number]>;
    readonly sourcePathByTargetPath: ReadonlyMap<string, string>;
};
type SourceFilePathQueue = {
    readonly push: (sourceFilePath: string) => unknown;
};
type SpecifierRecord = {
    readonly get: (key: string) => string | undefined;
    readonly set: (key: string, value: string) => unknown;
};
type ReachabilitySearch = {
    readonly has: (key: string) => boolean;
    readonly add: (key: string) => unknown;
};

function createContentLookup(bundle: BundleSubstitutionSource): ContentLookup {
    const contentBySourcePath = new Map<string, BundleSubstitutionSource['contents'][number]>();
    const sourcePathByTargetPath = new Map<string, string>();
    for (const content of bundle.contents) {
        contentBySourcePath.set(content.fileDescription.sourceFilePath, content);
        sourcePathByTargetPath.set(content.fileDescription.targetFilePath, content.fileDescription.sourceFilePath);
    }
    return { contentBySourcePath, sourcePathByTargetPath };
}

function exportDeclaration(
    statement: Readonly<typescript.Statement>
): Readonly<typescript.ExportDeclaration> | undefined {
    if (!typescript.isExportDeclaration(statement)) {
        return undefined;
    }
    return statement;
}

function moduleSpecifierText(statement: Readonly<typescript.ExportDeclaration>): string | undefined {
    const { moduleSpecifier } = statement;
    if (moduleSpecifier === undefined) {
        return undefined;
    }
    if (!typescript.isStringLiteral(moduleSpecifier) || !moduleSpecifier.text.startsWith('.')) {
        return undefined;
    }
    return moduleSpecifier.text;
}

function exportDeclarations(content: string): readonly Readonly<typescript.ExportDeclaration>[] {
    const sourceFile = typescript.createSourceFile(
        content,
        content,
        typescript.ScriptTarget.Latest
    );
    return sourceFile
        .statements
        .map(exportDeclaration)
        .filter(isDefined);
}

function exportedModuleSpecifiers(content: string): readonly string[] {
    return exportDeclarations(content)
        .map(moduleSpecifierText)
        .filter(isDefined);
}

function exportedTargetPath(currentTargetFilePath: string, specifier: string): string {
    return path.posix.normalize(path.posix.join(path.posix.dirname(currentTargetFilePath), specifier));
}

function enqueueExportedSourceFilePaths(
    lookup: ContentLookup,
    pending: SourceFilePathQueue,
    currentTargetFilePath: string,
    specifier: string
): void {
    const targetPath = exportedTargetPath(currentTargetFilePath, specifier);
    const sourcePaths = [ targetPath, ...declarationCompanionCandidates(targetPath) ]
        .map(function (candidate) {
            return lookup.sourcePathByTargetPath.get(candidate);
        })
        .filter(isDefined);
    for (const sourcePath of sourcePaths) {
        pending.push(sourcePath);
    }
}

function exportedSourceFilePaths(
    lookup: ContentLookup,
    currentTargetFilePath: string,
    specifier: string
): readonly string[] {
    const targetPath = exportedTargetPath(currentTargetFilePath, specifier);
    const sourceFilePaths: string[] = [];
    for (const candidate of [ targetPath, ...declarationCompanionCandidates(targetPath) ]) {
        for (const [ targetFilePath, sourceFilePath ] of lookup.sourcePathByTargetPath) {
            if (targetFilePath === candidate) {
                sourceFilePaths.push(sourceFilePath);
            }
        }
    }
    return sourceFilePaths;
}
function publicExportedSourceFilePaths(
    initialSourceFilePaths: readonly string[],
    lookup: ContentLookup
): ReadonlySet<string> {
    const pending = Array.from(initialSourceFilePaths);
    const visited = new Set<string>();

    function visitSourceFilePath(sourceFilePath: string): void {
        const content = lookup.contentBySourcePath.get(sourceFilePath);
        if (content !== undefined && !visited.has(sourceFilePath)) {
            visited.add(sourceFilePath);
            for (const specifier of exportedModuleSpecifiers(content.fileDescription.content)) {
                enqueueExportedSourceFilePaths(lookup, pending, content.fileDescription.targetFilePath, specifier);
            }
        }
    }

    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        visitSourceFilePath(next);
    }

    return visited;
}

type ExportNameQuery = {
    readonly lookup: ContentLookup;
    readonly targetSourceFilePath: string;
    readonly exportName: string;
    readonly visited: ReachabilitySearch;
};
type ExportNamespaceQuery = {
    readonly lookup: ContentLookup;
    readonly targetSourceFilePath: string;
    readonly visited: ReachabilitySearch;
};
type ExportNameResolver = (query: ExportNameQuery, sourceFilePath: string) => boolean;
type ExportNamespaceResolver = (query: ExportNamespaceQuery, sourceFilePath: string) => boolean;

function exportedName(namedExport: Readonly<typescript.ExportSpecifier>): string {
    return namedExport.name.text;
}

function sourceName(namedExport: Readonly<typescript.ExportSpecifier>): string {
    return namedExport.propertyName?.text ?? namedExport.name.text;
}

function namedExports(
    declaration: Readonly<typescript.ExportDeclaration>
): readonly Readonly<typescript.ExportSpecifier>[] {
    const { exportClause } = declaration;
    if (exportClause === undefined || !typescript.isNamedExports(exportClause)) {
        return [];
    }
    return Array.from(exportClause.elements);
}

function isExportStar(declaration: Readonly<typescript.ExportDeclaration>): boolean {
    return declaration.exportClause === undefined;
}

function reachabilityKey(sourceFilePath: string, targetSourceFilePath: string, exportName: string): string {
    return `${sourceFilePath}\0${targetSourceFilePath}\0${exportName}`;
}

function visitReachability(
    sourceFilePath: string,
    targetSourceFilePath: string,
    exportName: string,
    visited: ReachabilitySearch
): boolean {
    const key = reachabilityKey(sourceFilePath, targetSourceFilePath, exportName);
    if (visited.has(key)) {
        return false;
    }
    visited.add(key);
    return true;
}

function declarationSourceFilePaths(
    lookup: ContentLookup,
    currentTargetFilePath: string,
    declaration: Readonly<typescript.ExportDeclaration>
): readonly string[] {
    return exportedSourceFilePaths(lookup, currentTargetFilePath, moduleSpecifierText(declaration) ?? '');
}

function exportStarCanExportName(
    resolveExportName: ExportNameResolver,
    query: ExportNameQuery,
    sourceFilePaths: readonly string[],
    declaration: Readonly<typescript.ExportDeclaration>
): boolean {
    return isExportStar(declaration) &&
        query.exportName !== 'default' &&
        sourceFilePaths.some(function (sourceFilePath) {
            return resolveExportName(query, sourceFilePath);
        });
}

function namedExportCanExportName(
    resolveExportName: ExportNameResolver,
    query: ExportNameQuery,
    sourceFilePaths: readonly string[],
    namedExport: Readonly<typescript.ExportSpecifier>
): boolean {
    if (exportedName(namedExport) !== query.exportName) {
        return false;
    }
    return sourceFilePaths.some(function (sourceFilePath) {
        return resolveExportName({ ...query, exportName: sourceName(namedExport) }, sourceFilePath);
    });
}

function declarationCanExportName(
    resolveExportName: ExportNameResolver,
    query: ExportNameQuery,
    currentTargetFilePath: string,
    declaration: Readonly<typescript.ExportDeclaration>
): boolean {
    const sourceFilePaths = declarationSourceFilePaths(query.lookup, currentTargetFilePath, declaration);
    return exportStarCanExportName(resolveExportName, query, sourceFilePaths, declaration) ||
        namedExports(declaration).some(function (namedExport) {
            return namedExportCanExportName(resolveExportName, query, sourceFilePaths, namedExport);
        });
}

function sourceFileCanExportName(query: ExportNameQuery, sourceFilePath: string): boolean {
    if (sourceFilePath === query.targetSourceFilePath) {
        return true;
    }
    if (!visitReachability(sourceFilePath, query.targetSourceFilePath, query.exportName, query.visited)) {
        return false;
    }

    const content = query.lookup.contentBySourcePath.get(sourceFilePath);
    return content !== undefined &&
        exportDeclarations(content.fileDescription.content).some(function (declaration) {
            return declarationCanExportName(
                sourceFileCanExportName,
                query,
                content.fileDescription.targetFilePath,
                declaration
            );
        });
}

function declarationCanExportNamespace(
    resolveExportNamespace: ExportNamespaceResolver,
    query: ExportNamespaceQuery,
    currentTargetFilePath: string,
    declaration: Readonly<typescript.ExportDeclaration>
): boolean {
    const sourceFilePaths = declarationSourceFilePaths(query.lookup, currentTargetFilePath, declaration);
    return isExportStar(declaration) && sourceFilePaths.some(function (sourceFilePath) {
        return resolveExportNamespace(query, sourceFilePath);
    });
}

function sourceFileCanExportNamespace(query: ExportNamespaceQuery, sourceFilePath: string): boolean {
    if (sourceFilePath === query.targetSourceFilePath) {
        return true;
    }
    if (
        !visitReachability(
            sourceFilePath,
            query.targetSourceFilePath,
            query.targetSourceFilePath,
            query.visited
        )
    ) {
        return false;
    }

    const content = query.lookup.contentBySourcePath.get(sourceFilePath);
    return content !== undefined &&
        exportDeclarations(content.fileDescription.content).some(function (declaration) {
            return declarationCanExportNamespace(
                sourceFileCanExportNamespace,
                query,
                content.fileDescription.targetFilePath,
                declaration
            );
        });
}

function publicModuleCanSatisfyRequest(
    rootSourceFilePathsForModule: readonly string[],
    lookup: ContentLookup,
    request: ImportPathReplacementRequest
): boolean {
    for (const exportName of request.requiredExportNames) {
        const canExportName = rootSourceFilePathsForModule.some(function (sourceFilePath) {
            const query = {
                lookup,
                targetSourceFilePath: request.sourceFilePath,
                exportName,
                visited: new Set<string>()
            };
            return sourceFileCanExportName(query, sourceFilePath);
        });
        if (!canExportName) {
            return false;
        }
    }

    if (!request.requiresNamespaceExport) {
        return true;
    }

    return rootSourceFilePathsForModule.some(function (sourceFilePath) {
        const query = {
            lookup,
            targetSourceFilePath: request.sourceFilePath,
            visited: new Set<string>()
        };
        return sourceFileCanExportNamespace(query, sourceFilePath);
    });
}

function exportedSourceFilePathsForRequest(
    rootPaths: readonly string[],
    lookup: ContentLookup,
    request: ImportPathReplacementRequest
): ReadonlySet<string> {
    const sourceFilePaths = publicExportedSourceFilePaths(rootPaths, lookup);
    if (!publicModuleCanSatisfyRequest(rootPaths, lookup, request)) {
        return new Set();
    }
    return sourceFilePaths;
}

function recordShortestSpecifier(
    specifiersBySourcePath: SpecifierRecord,
    sourceFilePaths: ReadonlySet<string>,
    specifier: string
): void {
    for (const sourceFilePath of sourceFilePaths) {
        const current = specifiersBySourcePath.get(sourceFilePath);
        if (current === undefined || specifier.length < current.length) {
            specifiersBySourcePath.set(sourceFilePath, specifier);
        }
    }
}

function getExplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    surface: ExplicitPackageSurface,
    request: ImportPathReplacementRequest
): string | undefined {
    const lookup = createContentLookup(bundle);
    const specifiersBySourcePath = new Map<string, string>();
    const moduleEntries = surface.packageInterface.modules ?? [];
    for (const moduleEntry of moduleEntries) {
        const root = getRoot(bundle, moduleEntry.root);
        const rootPaths = rootSourceFilePaths(root);
        recordShortestSpecifier(
            specifiersBySourcePath,
            exportedSourceFilePathsForRequest(rootPaths, lookup, request),
            toPackageSpecifier(bundle.name, moduleEntry.export)
        );
    }

    return specifiersBySourcePath.get(request.sourceFilePath);
}

function getImplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    surface: ImplicitPackageSurface,
    request: ImportPathReplacementRequest
): string | undefined {
    const lookup = createContentLookup(bundle);
    const specifiersBySourcePath = new Map<string, string>();
    const defaultRoot = getRoot(bundle, surface.defaultModuleRoot);
    recordShortestSpecifier(
        specifiersBySourcePath,
        exportedSourceFilePathsForRequest(rootSourceFilePaths(defaultRoot), lookup, request),
        bundle.name
    );

    for (const root of Object.values(bundle.roots)) {
        const rootPaths = rootSourceFilePaths(root);
        recordShortestSpecifier(
            specifiersBySourcePath,
            exportedSourceFilePathsForRequest(rootPaths, lookup, request),
            toPackageSpecifier(bundle.name, `./${root.js.targetFilePath}`)
        );
    }

    return specifiersBySourcePath.get(request.sourceFilePath) ??
        getPublicModuleSpecifierForSourcePath(bundle, request.sourceFilePath);
}

function getExistingPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    request: ImportPathReplacementRequest
): string | undefined {
    const { surface } = bundle;
    if (surface.mode === 'implicit') {
        return getImplicitPublicModuleSpecifierForSourcePath(bundle, surface, request);
    }

    return getExplicitPublicModuleSpecifierForSourcePath(bundle, surface, request);
}

function findReplacementInBundles(
    request: ImportPathReplacementRequest,
    bundles: readonly BundleSubstitutionSource[],
    getTargetPath: (bundle: BundleSubstitutionSource, request: ImportPathReplacementRequest) => string | undefined
): ImportPathReplacement | undefined {
    for (const bundle of bundles) {
        const targetPath = getTargetPath(bundle, request);
        if (targetPath !== undefined) {
            return {
                emittedSpecifier: targetPath,
                packageName: bundle.name
            };
        }
        if (needsImportReplacement(request.sourceFilePath) && ownsSourcePath(request.sourceFilePath, bundle)) {
            throw new Error(
                `Package "${bundle.name}" does not expose "${request.sourceFilePath}" for cross-package substitution`
            );
        }
    }

    return undefined;
}

function findReplacement(
    request: ImportPathReplacementRequest,
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): ImportPathReplacement | undefined {
    const dependencyReplacement = findReplacementInBundles(
        request,
        bundleDependencies,
        function (bundle, replacementRequest) {
            return getPublicModuleSpecifierForSourcePath(bundle, replacementRequest.sourceFilePath);
        }
    );
    if (dependencyReplacement !== undefined) {
        return dependencyReplacement;
    }
    return findReplacementInBundles(request, bundlePeerDependencies, getExistingPublicModuleSpecifierForSourcePath);
}

function withSubstitutedSourcePath(
    substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    packageName: string,
    file: string
): ReadonlyMap<string, ReadonlySet<string>> {
    if (declarationCompanionCandidates(file).length === 0) {
        return substitutedSourceFilePathsByPackageName;
    }

    const existing = substitutedSourceFilePathsByPackageName.get(packageName) ?? [];
    const updated = new Map(substitutedSourceFilePathsByPackageName);
    updated.set(packageName, new Set([ ...existing, file ]));
    return updated;
}

export function findAllPathReplacements(
    requests: readonly ImportPathReplacementRequest[],
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): Replacements {
    const importPathReplacements = new Map<string, ImportPathReplacement>();
    const matchedBundleDependencies: string[] = [];
    let substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>> = new Map();

    for (const request of requests) {
        const replacement = findReplacement(request, bundleDependencies, bundlePeerDependencies);
        if (replacement !== undefined) {
            importPathReplacements.set(request.sourceFilePath, replacement);
            matchedBundleDependencies.push(replacement.packageName);
            substitutedSourceFilePathsByPackageName = withSubstitutedSourcePath(
                substitutedSourceFilePathsByPackageName,
                replacement.packageName,
                request.sourceFilePath
            );
        }
    }

    return {
        importPathReplacements,
        bundleDependencies: matchedBundleDependencies,
        substitutedSourceFilePathsByPackageName
    };
}
