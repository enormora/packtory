import path from 'node:path';
import { ts as typescript } from 'ts-morph';
import {
    declarationCompanionCandidates,
    isDeclarationCompanionFilePath
} from '../common/declaration-companion-paths.ts';
import { bfsClosure, type BfsClosureDependencies } from '../dead-code-eliminator/reachability/bfs-closure.ts';
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

type BundleReplacementLookup = {
    readonly bundleDependencies: readonly BundleSubstitutionSource[];
    readonly bundlePeerDependencies: readonly BundleSubstitutionSource[];
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

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

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

function exportedTargetPath(currentTargetFilePath: string, specifier: string): string {
    return path.posix.normalize(path.posix.join(path.posix.dirname(currentTargetFilePath), specifier));
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

type ExportState = {
    readonly sourceFilePath: string;
    readonly exportName: string | undefined;
};

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

function declarationSourceFilePaths(
    lookup: ContentLookup,
    currentTargetFilePath: string,
    declaration: Readonly<typescript.ExportDeclaration>
): readonly string[] {
    return exportedSourceFilePaths(lookup, currentTargetFilePath, moduleSpecifierText(declaration) ?? '');
}

const pathClosureDependencies = {
    visitedHas<T>(visited: ReadonlySet<T>, value: T): boolean {
        return visited.has(value);
    }
} as const;

function exportStateValue(value: unknown, property: keyof ExportState): unknown {
    return Reflect.get(new Object(value), property);
}

function sourceFilePathForState(state: ExportState): string {
    return state.sourceFilePath;
}

const exportClosureDependencies: BfsClosureDependencies = {
    visitedHas<T>(visited: ReadonlySet<T>, value: T): boolean {
        return Array.from(visited).some(function (state) {
            return exportStateValue(state, 'sourceFilePath') === exportStateValue(value, 'sourceFilePath') &&
                exportStateValue(state, 'exportName') === exportStateValue(value, 'exportName');
        });
    }
};

function exportedStateNames(
    lookup: ContentLookup,
    state: ExportState
): readonly ExportState[] {
    const content = lookup.contentBySourcePath.get(sourceFilePathForState(state));
    if (content === undefined) {
        return Array.from(new Set<ExportState>());
    }

    return exportDeclarations(content.fileDescription.content).flatMap(function (declaration) {
        const sourceFilePaths = declarationSourceFilePaths(lookup, content.fileDescription.targetFilePath, declaration);
        const exportStarStates = sourceFilePaths
            .filter(function () {
                return state.exportName !== 'default' && isExportStar(declaration);
            })
            .map(function (nextSourceFilePath) {
                return { sourceFilePath: nextSourceFilePath, exportName: state.exportName };
            });
        const namedExportStates = namedExports(declaration)
            .filter(function (namedExport) {
                return namedExport.name.text === state.exportName;
            })
            .flatMap(function (namedExport) {
                const sourceExportName = namedExport.propertyName?.text ?? namedExport.name.text;
                return sourceFilePaths.map(function (nextSourceFilePath) {
                    return { sourceFilePath: nextSourceFilePath, exportName: sourceExportName };
                });
            });
        return [ ...exportStarStates, ...namedExportStates ];
    });
}

function publicModuleCanExport(
    rootSourceFilePathsForModule: readonly string[],
    lookup: ContentLookup,
    request: ImportPathReplacementRequest,
    exportName: string | undefined
): boolean {
    const closure = bfsClosure(
        rootSourceFilePathsForModule.map(function (sourceFilePath) {
            return { sourceFilePath, exportName };
        }),
        function (state) {
            return exportedStateNames(lookup, state);
        },
        new Set(),
        { dependencies: exportClosureDependencies, maximumNodeCount: lookup.contentBySourcePath.size }
    );
    return Array.from(closure).some(function (state) {
        return sourceFilePathForState(state) === request.sourceFilePath;
    });
}

function publicModuleReachesSourceFile(
    rootSourceFilePathsForModule: readonly string[],
    lookup: ContentLookup,
    request: ImportPathReplacementRequest
): boolean {
    const closure = bfsClosure(
        rootSourceFilePathsForModule,
        function (sourceFilePath) {
            const content = lookup.contentBySourcePath.get(sourceFilePath);
            return content === undefined
                ? new Array<string>()
                : exportDeclarations(content.fileDescription.content).flatMap(function (declaration) {
                    return declarationSourceFilePaths(lookup, content.fileDescription.targetFilePath, declaration);
                });
        },
        new Set(),
        { dependencies: pathClosureDependencies, maximumNodeCount: lookup.contentBySourcePath.size }
    );
    return closure.has(request.sourceFilePath);
}

function publicModuleCanSatisfyRequest(
    rootSourceFilePathsForModule: readonly string[],
    lookup: ContentLookup,
    request: ImportPathReplacementRequest
): boolean {
    if (request.requiredExportNames.size === 0 && !request.requiresNamespaceExport) {
        return publicModuleReachesSourceFile(rootSourceFilePathsForModule, lookup, request);
    }
    for (const exportName of request.requiredExportNames) {
        if (!publicModuleCanExport(rootSourceFilePathsForModule, lookup, request, exportName)) {
            return false;
        }
    }

    if (!request.requiresNamespaceExport) {
        return true;
    }

    return publicModuleCanExport(rootSourceFilePathsForModule, lookup, request, undefined);
}

function shortestSpecifier(specifiers: readonly string[]): string | undefined {
    const [ specifier ] = specifiers.toSorted(function (left, right) {
        return left.length - right.length;
    });
    return specifier;
}

function getExplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    surface: ExplicitPackageSurface,
    request: ImportPathReplacementRequest
): string | undefined {
    const lookup = createContentLookup(bundle);
    const specifiers: string[] = [];
    const moduleEntries = surface.packageInterface.modules ?? [];
    for (const moduleEntry of moduleEntries) {
        const root = getRoot(bundle, moduleEntry.root);
        const rootPaths = rootSourceFilePaths(root);
        const candidate = toPackageSpecifier(bundle.name, moduleEntry.export);
        if (publicModuleCanSatisfyRequest(rootPaths, lookup, request)) {
            specifiers.push(candidate);
        }
    }

    return shortestSpecifier(specifiers);
}

function getImplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    surface: ImplicitPackageSurface,
    request: ImportPathReplacementRequest
): string | undefined {
    const lookup = createContentLookup(bundle);
    const specifiers: string[] = [];
    const defaultRoot = getRoot(bundle, surface.defaultModuleRoot);
    if (publicModuleCanSatisfyRequest(rootSourceFilePaths(defaultRoot), lookup, request)) {
        specifiers.push(bundle.name);
    }

    for (const root of Object.values(bundle.roots)) {
        const candidate = toPackageSpecifier(bundle.name, `./${root.js.targetFilePath}`);
        if (publicModuleCanSatisfyRequest(rootSourceFilePaths(root), lookup, request)) {
            specifiers.push(candidate);
        }
    }

    return shortestSpecifier(specifiers) ?? getPublicModuleSpecifierForSourcePath(bundle, request.sourceFilePath);
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
    const existing = substitutedSourceFilePathsByPackageName.get(packageName) ?? [];
    const updated = new Map(substitutedSourceFilePathsByPackageName);
    updated.set(packageName, new Set([ ...existing, file ]));
    return updated;
}

function contentWithSourceFilePath(
    bundle: BundleSubstitutionSource,
    sourceFilePath: string
): BundleSubstitutionSource['contents'][number] | undefined {
    return bundle.contents.find(function (content) {
        return content.fileDescription.sourceFilePath === sourceFilePath;
    });
}

function runtimeSourceFilePathForDeclaration(
    bundle: BundleSubstitutionSource,
    declarationSourceFilePath: string
): string | undefined {
    const declarationContent = contentWithSourceFilePath(bundle, declarationSourceFilePath);
    if (declarationContent === undefined) {
        return undefined;
    }

    const runtimeContent = bundle.contents.find(function (content) {
        return declarationCompanionCandidates(content.fileDescription.targetFilePath)
            .includes(declarationContent.fileDescription.targetFilePath);
    });
    return runtimeContent?.fileDescription.sourceFilePath;
}

function substitutedSourceFilePathsFor(
    bundle: BundleSubstitutionSource,
    file: string
): readonly string[] {
    if (declarationCompanionCandidates(file).length > 0) {
        return [
            file
        ];
    }

    if (!isDeclarationCompanionFilePath(file)) {
        return [];
    }

    const runtimeSourceFilePath = runtimeSourceFilePathForDeclaration(bundle, file);
    if (runtimeSourceFilePath === undefined) {
        return contentWithSourceFilePath(bundle, file) === undefined
            ? []
            : [
                file
            ];
    }

    return [
        runtimeSourceFilePath,
        file
    ];
}

function bundleNamed(
    bundles: readonly BundleSubstitutionSource[],
    packageName: string
): BundleSubstitutionSource | undefined {
    return bundles.find(function (bundle) {
        return bundle.name === packageName;
    });
}

function bundleForReplacement(
    replacement: ImportPathReplacement,
    bundleLookup: BundleReplacementLookup
): BundleSubstitutionSource | undefined {
    return bundleNamed([
        ...bundleLookup.bundleDependencies,
        ...bundleLookup.bundlePeerDependencies
    ], replacement.packageName);
}

function withSubstitutedSourcePaths(
    substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    replacement: ImportPathReplacement,
    request: ImportPathReplacementRequest,
    bundleLookup: BundleReplacementLookup
): ReadonlyMap<string, ReadonlySet<string>> {
    const bundle = bundleForReplacement(replacement, bundleLookup);
    if (bundle === undefined) {
        return substitutedSourceFilePathsByPackageName;
    }

    let updated = substitutedSourceFilePathsByPackageName;
    for (const sourceFilePath of substitutedSourceFilePathsFor(bundle, request.sourceFilePath)) {
        updated = withSubstitutedSourcePath(updated, replacement.packageName, sourceFilePath);
    }
    return updated;
}

export function findAllPathReplacements(
    requests: readonly ImportPathReplacementRequest[],
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): Replacements {
    const importPathReplacements = new Map<string, ImportPathReplacement>();
    const matchedBundleDependencies: string[] = [];
    const bundleLookup: BundleReplacementLookup = { bundleDependencies, bundlePeerDependencies };
    let substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>> = new Map();

    function recordReplacement(replacement: ImportPathReplacement, request: ImportPathReplacementRequest): void {
        importPathReplacements.set(request.sourceFilePath, replacement);
        matchedBundleDependencies.push(replacement.packageName);
        substitutedSourceFilePathsByPackageName = withSubstitutedSourcePaths(
            substitutedSourceFilePathsByPackageName,
            replacement,
            request,
            bundleLookup
        );
    }

    for (const request of requests) {
        const replacement = findReplacement(request, bundleDependencies, bundlePeerDependencies);
        if (replacement !== undefined) {
            recordReplacement(replacement, request);
        }
    }

    return {
        importPathReplacements,
        bundleDependencies: matchedBundleDependencies,
        substitutedSourceFilePathsByPackageName
    };
}
