import path from 'node:path';
import { ts as typescript } from 'ts-morph';
import {
    declarationCompanionCandidates,
    isDeclarationCompanionFilePath
} from '../common/declaration-companion-paths.ts';
import { bfsClosure, type BfsClosureDependencies } from '../dead-code-eliminator/reachability/bfs-closure.ts';
import type { ExplicitPackageSurface, ImplicitPackageSurface } from '../package-surface/surface.ts';
import { rootInputFilePaths } from '../package-surface/package-surface-index.ts';
import { getPublicModuleSpecifierForSourcePath } from '../package-surface/public-specifiers.ts';
import { getRoot } from '../package-surface/root-registry.ts';
import { toPackageSpecifier } from '../package-surface/specifier-syntax.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';

export type ImportPathReplacement = {
    readonly emittedSpecifier: string;
    readonly packageName: string;
};

export type ImportPathReplacementRequest = {
    readonly inputFilePath: string;
    readonly requiredExportNames: ReadonlySet<string>;
    readonly requiresNamespaceExport: boolean;
};

export type Replacements = {
    readonly importPathReplacements: ReadonlyMap<string, ImportPathReplacement>;
    readonly bundleDependencies: readonly string[];
    readonly substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>;
};

type ReplacementMatch = {
    readonly bundle: BundleSubstitutionSource;
    readonly replacement: ImportPathReplacement;
};

export function ownsSourcePath(file: string, bundle: BundleSubstitutionSource): boolean {
    return bundle.contents.some(function (content) {
        return content.fileDescription.inputFilePath === file;
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
        contentBySourcePath.set(content.fileDescription.inputFilePath, content);
        sourcePathByTargetPath.set(content.fileDescription.targetFilePath, content.fileDescription.inputFilePath);
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

function exportedInputFilePaths(
    lookup: ContentLookup,
    currentTargetFilePath: string,
    specifier: string
): readonly string[] {
    const targetPath = exportedTargetPath(currentTargetFilePath, specifier);
    const inputFilePaths: string[] = [];
    for (const candidate of [ targetPath, ...declarationCompanionCandidates(targetPath) ]) {
        for (const [ targetFilePath, inputFilePath ] of lookup.sourcePathByTargetPath) {
            if (targetFilePath === candidate) {
                inputFilePaths.push(inputFilePath);
            }
        }
    }
    return inputFilePaths;
}

type ExportState = {
    readonly inputFilePath: string;
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

function declarationInputFilePaths(
    lookup: ContentLookup,
    currentTargetFilePath: string,
    declaration: Readonly<typescript.ExportDeclaration>
): readonly string[] {
    return exportedInputFilePaths(lookup, currentTargetFilePath, moduleSpecifierText(declaration) ?? '');
}

const pathClosureDependencies: BfsClosureDependencies<string> = {
    visitedHas(visited, value): boolean {
        return visited.has(value);
    },
    neighborAdded: undefined
};

function exportStateValue(value: unknown, property: keyof ExportState): unknown {
    return Reflect.get(new Object(value), property);
}

function inputFilePathForState(state: ExportState): string {
    return state.inputFilePath;
}

const exportClosureDependencies: BfsClosureDependencies<ExportState> = {
    visitedHas<T>(visited: ReadonlySet<T>, value: T): boolean {
        return Array.from(visited).some(function (state) {
            return exportStateValue(state, 'inputFilePath') === exportStateValue(value, 'inputFilePath') &&
                exportStateValue(state, 'exportName') === exportStateValue(value, 'exportName');
        });
    },
    neighborAdded: undefined
};

function exportedStateNames(
    lookup: ContentLookup,
    state: ExportState
): readonly ExportState[] {
    const content = lookup.contentBySourcePath.get(inputFilePathForState(state));
    if (content === undefined) {
        return Array.from(new Set<ExportState>());
    }

    return exportDeclarations(content.fileDescription.content).flatMap(function (declaration) {
        const inputFilePaths = declarationInputFilePaths(lookup, content.fileDescription.targetFilePath, declaration);
        const exportStarStates = inputFilePaths
            .filter(function () {
                return state.exportName !== 'default' && isExportStar(declaration);
            })
            .map(function (nextInputFilePath) {
                return { inputFilePath: nextInputFilePath, exportName: state.exportName };
            });
        const namedExportStates = namedExports(declaration)
            .filter(function (namedExport) {
                return namedExport.name.text === state.exportName;
            })
            .flatMap(function (namedExport) {
                const sourceExportName = namedExport.propertyName?.text ?? namedExport.name.text;
                return inputFilePaths.map(function (nextInputFilePath) {
                    return { inputFilePath: nextInputFilePath, exportName: sourceExportName };
                });
            });
        return [ ...exportStarStates, ...namedExportStates ];
    });
}

function publicModuleCanExport(
    rootInputFilePathsForModule: readonly string[],
    lookup: ContentLookup,
    request: ImportPathReplacementRequest,
    exportName: string | undefined
): boolean {
    const closure = bfsClosure(
        rootInputFilePathsForModule.map(function (inputFilePath) {
            return { inputFilePath, exportName };
        }),
        function (state) {
            return exportedStateNames(lookup, state);
        },
        new Set(),
        { dependencies: exportClosureDependencies, maximumNodeCount: lookup.contentBySourcePath.size }
    );
    return Array.from(closure).some(function (state) {
        return inputFilePathForState(state) === request.inputFilePath;
    });
}

function publicModuleReachesSourceFile(
    rootInputFilePathsForModule: readonly string[],
    lookup: ContentLookup,
    request: ImportPathReplacementRequest
): boolean {
    const closure = bfsClosure(
        rootInputFilePathsForModule,
        function (inputFilePath) {
            const content = lookup.contentBySourcePath.get(inputFilePath);
            return content === undefined
                ? new Array<string>()
                : exportDeclarations(content.fileDescription.content).flatMap(function (declaration) {
                    return declarationInputFilePaths(lookup, content.fileDescription.targetFilePath, declaration);
                });
        },
        new Set(),
        { dependencies: pathClosureDependencies, maximumNodeCount: lookup.contentBySourcePath.size }
    );
    return closure.has(request.inputFilePath);
}

function publicModuleCanSatisfyRequest(
    rootInputFilePathsForModule: readonly string[],
    lookup: ContentLookup,
    request: ImportPathReplacementRequest
): boolean {
    if (request.requiredExportNames.size === 0 && !request.requiresNamespaceExport) {
        return publicModuleReachesSourceFile(rootInputFilePathsForModule, lookup, request);
    }
    for (const exportName of request.requiredExportNames) {
        if (!publicModuleCanExport(rootInputFilePathsForModule, lookup, request, exportName)) {
            return false;
        }
    }

    if (!request.requiresNamespaceExport) {
        return true;
    }

    return publicModuleCanExport(rootInputFilePathsForModule, lookup, request, undefined);
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
        const rootPaths = rootInputFilePaths(root);
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
    if (publicModuleCanSatisfyRequest(rootInputFilePaths(defaultRoot), lookup, request)) {
        specifiers.push(bundle.name);
    }

    for (const root of Object.values(bundle.roots)) {
        const candidate = toPackageSpecifier(bundle.name, `./${root.js.targetFilePath}`);
        if (publicModuleCanSatisfyRequest(rootInputFilePaths(root), lookup, request)) {
            specifiers.push(candidate);
        }
    }

    return shortestSpecifier(specifiers) ?? getPublicModuleSpecifierForSourcePath(bundle, request.inputFilePath);
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
): ReplacementMatch | undefined {
    for (const bundle of bundles) {
        const targetPath = getTargetPath(bundle, request);
        if (targetPath !== undefined) {
            return {
                bundle,
                replacement: {
                    emittedSpecifier: targetPath,
                    packageName: bundle.name
                }
            };
        }
        if (needsImportReplacement(request.inputFilePath) && ownsSourcePath(request.inputFilePath, bundle)) {
            throw new Error(
                `Package "${bundle.name}" does not expose "${request.inputFilePath}" for cross-package substitution`
            );
        }
    }

    return undefined;
}

function findReplacement(
    request: ImportPathReplacementRequest,
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): ReplacementMatch | undefined {
    const dependencyReplacement = findReplacementInBundles(
        request,
        bundleDependencies,
        function (bundle, replacementRequest) {
            return getPublicModuleSpecifierForSourcePath(bundle, replacementRequest.inputFilePath);
        }
    );
    if (dependencyReplacement !== undefined) {
        return dependencyReplacement;
    }
    return findReplacementInBundles(request, bundlePeerDependencies, getExistingPublicModuleSpecifierForSourcePath);
}

function withSubstitutedSourcePath(
    substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    packageName: string,
    file: string
): ReadonlyMap<string, ReadonlySet<string>> {
    const existing = substitutedInputFilePathsByPackageName.get(packageName) ?? [];
    const updated = new Map(substitutedInputFilePathsByPackageName);
    updated.set(packageName, new Set([ ...existing, file ]));
    return updated;
}

function contentWithInputFilePath(
    bundle: BundleSubstitutionSource,
    inputFilePath: string
): BundleSubstitutionSource['contents'][number] | undefined {
    return bundle.contents.find(function (content) {
        return content.fileDescription.inputFilePath === inputFilePath;
    });
}

function runtimeInputFilePathForDeclaration(
    bundle: BundleSubstitutionSource,
    declarationContent: BundleSubstitutionSource['contents'][number]
): string | undefined {
    const runtimeContent = bundle.contents.find(function (content) {
        return declarationCompanionCandidates(content.fileDescription.targetFilePath)
            .includes(declarationContent.fileDescription.targetFilePath);
    });
    return runtimeContent?.fileDescription.inputFilePath;
}

function substitutedInputFilePathsFor(
    bundle: BundleSubstitutionSource,
    file: string
): readonly string[] {
    const content = contentWithInputFilePath(bundle, file);
    if (content === undefined || !isDeclarationCompanionFilePath(content.fileDescription.targetFilePath)) {
        return declarationCompanionCandidates(file).length === 0
            ? []
            : [
                file
            ];
    }

    const runtimeInputFilePath = runtimeInputFilePathForDeclaration(bundle, content);
    if (runtimeInputFilePath === undefined) {
        return [
            file
        ];
    }

    return [
        runtimeInputFilePath,
        file
    ];
}

function withSubstitutedSourcePaths(
    substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    match: ReplacementMatch,
    request: ImportPathReplacementRequest
): ReadonlyMap<string, ReadonlySet<string>> {
    let updated = substitutedInputFilePathsByPackageName;
    for (const inputFilePath of substitutedInputFilePathsFor(match.bundle, request.inputFilePath)) {
        updated = withSubstitutedSourcePath(updated, match.replacement.packageName, inputFilePath);
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
    let substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>> = new Map();

    function recordReplacement(match: ReplacementMatch, request: ImportPathReplacementRequest): void {
        importPathReplacements.set(request.inputFilePath, match.replacement);
        matchedBundleDependencies.push(match.replacement.packageName);
        substitutedInputFilePathsByPackageName = withSubstitutedSourcePaths(
            substitutedInputFilePathsByPackageName,
            match,
            request
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
        substitutedInputFilePathsByPackageName
    };
}
