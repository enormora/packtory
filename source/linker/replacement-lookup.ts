import path from 'node:path';
import { Maybe } from 'true-myth';
import { ts as typescript } from 'ts-morph';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import { rootSourceFilePaths } from '../package-surface/package-surface-index.ts';
import { getPublicModuleSpecifierForSourcePath } from '../package-surface/public-specifiers.ts';
import { getRoot } from '../package-surface/root-registry.ts';
import { toPackageSpecifier } from '../package-surface/specifier-syntax.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';

type Replacement = {
    readonly targetPath: string;
    readonly packageName: string;
};

type BundleImportRewriteSource = {
    readonly bundle: BundleSubstitutionSource;
    readonly exportPolicy: 'existingExportOnly' | 'mayAddExport';
};

type PublicModuleRoot = {
    readonly sourceFilePaths: readonly string[];
    readonly specifier: string;
};

export type Replacements = {
    readonly importPathReplacements: ReadonlyMap<string, string>;
    readonly bundleDependencies: readonly string[];
};

export function ownsSourcePath(file: string, bundle: BundleSubstitutionSource): boolean {
    return bundle.contents.some(function (content) {
        return content.fileDescription.sourceFilePath === file;
    });
}

function needsImportReplacement(file: string): boolean {
    return !file.endsWith('.map');
}

function implicitPublicModuleRoots(bundle: BundleSubstitutionSource): readonly PublicModuleRoot[] {
    if (bundle.surface.mode !== 'implicit') {
        return [];
    }
    const defaultRoot = getRoot(bundle, bundle.surface.defaultModuleRoot);
    const roots: PublicModuleRoot[] = [
        { sourceFilePaths: rootSourceFilePaths(defaultRoot), specifier: bundle.name }
    ];
    for (const [ rootId, root ] of Object.entries(bundle.roots)) {
        if (rootId !== bundle.surface.defaultModuleRoot) {
            roots.push({
                sourceFilePaths: rootSourceFilePaths(root),
                specifier: toPackageSpecifier(bundle.name, `./${root.js.targetFilePath}`)
            });
        }
    }
    return roots;
}

function explicitPublicModuleRoots(bundle: BundleSubstitutionSource): readonly PublicModuleRoot[] {
    if (bundle.surface.mode !== 'explicit') {
        return [];
    }
    return (bundle.surface.packageInterface.modules ?? []).map(function (moduleEntry) {
        const root = getRoot(bundle, moduleEntry.root);
        return {
            sourceFilePaths: rootSourceFilePaths(root),
            specifier: toPackageSpecifier(bundle.name, moduleEntry.export)
        };
    });
}

function publicModuleRoots(bundle: BundleSubstitutionSource): readonly PublicModuleRoot[] {
    return [ ...implicitPublicModuleRoots(bundle), ...explicitPublicModuleRoots(bundle) ];
}

type ContentLookup = {
    readonly contentBySourcePath: ReadonlyMap<string, BundleSubstitutionSource['contents'][number]>;
    readonly sourcePathByTargetPath: ReadonlyMap<string, string>;
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

function exportedModuleSpecifiers(sourceFilePath: string, content: string): readonly string[] {
    const sourceFile = typescript.createSourceFile(sourceFilePath, content, typescript.ScriptTarget.Latest, true);
    const specifiers: string[] = [];

    sourceFile.forEachChild(function visit(node) {
        if (
            typescript.isExportDeclaration(node) &&
            node.moduleSpecifier !== undefined &&
            typescript.isStringLiteralLike(node.moduleSpecifier)
        ) {
            specifiers.push(node.moduleSpecifier.text);
        }
        node.forEachChild(visit);
    });

    return specifiers;
}

function exportedTargetPathCandidates(currentTargetFilePath: string, specifier: string): readonly string[] {
    if (!specifier.startsWith('.')) {
        return [];
    }
    const targetPath = path.posix.normalize(path.posix.join(path.posix.dirname(currentTargetFilePath), specifier));
    return [ targetPath, ...declarationCompanionCandidates(targetPath) ];
}

function resolveExportedSourceFilePaths(
    lookup: ContentLookup,
    currentTargetFilePath: string,
    specifier: string
): readonly string[] {
    return exportedTargetPathCandidates(currentTargetFilePath, specifier).flatMap(function (targetPath) {
        const sourcePath = lookup.sourcePathByTargetPath.get(targetPath);
        return sourcePath === undefined ? [] : [ sourcePath ];
    });
}

function exportedDependenciesForSourcePath(
    lookup: ContentLookup,
    sourceFilePath: string
): readonly string[] {
    const content = lookup.contentBySourcePath.get(sourceFilePath);
    if (content === undefined) {
        return [];
    }
    const { targetFilePath } = content.fileDescription;
    return exportedModuleSpecifiers(sourceFilePath, content.fileDescription.content).flatMap(function (specifier) {
        return resolveExportedSourceFilePaths(lookup, targetFilePath, specifier);
    });
}

function publicExportedSourceFilePaths(
    initialSourceFilePaths: readonly string[],
    lookup: ContentLookup
): ReadonlySet<string> {
    const pending = Array.from(initialSourceFilePaths);
    const visited = new Set<string>();

    function visitSourceFilePath(sourceFilePath: string): void {
        if (!visited.has(sourceFilePath)) {
            visited.add(sourceFilePath);
            pending.push(...exportedDependenciesForSourcePath(lookup, sourceFilePath));
        }
    }

    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        visitSourceFilePath(next);
    }

    return visited;
}

function publicRootSourceFilePaths(root: PublicModuleRoot, lookup: ContentLookup): ReadonlySet<string> {
    return new Set(root.sourceFilePaths.filter(function (sourceFilePath) {
        return lookup.contentBySourcePath.has(sourceFilePath);
    }));
}

function existingPublicSpecifierSourceFilePaths(root: PublicModuleRoot, lookup: ContentLookup): ReadonlySet<string> {
    return new Set([
        ...publicRootSourceFilePaths(root, lookup),
        ...publicExportedSourceFilePaths(root.sourceFilePaths, lookup)
    ]);
}

type SpecifierRecord = {
    readonly get: (key: string) => string | undefined;
    readonly set: (key: string, value: string) => unknown;
};

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

function getExistingPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    sourceFilePath: string
): string | undefined {
    const lookup = createContentLookup(bundle);
    const specifiersBySourcePath = new Map<string, string>();
    for (const root of publicModuleRoots(bundle)) {
        recordShortestSpecifier(
            specifiersBySourcePath,
            existingPublicSpecifierSourceFilePaths(root, lookup),
            root.specifier
        );
    }

    return specifiersBySourcePath.get(sourceFilePath);
}

function getReplacementTargetPath(source: BundleImportRewriteSource, file: string): string | undefined {
    if (source.exportPolicy === 'existingExportOnly') {
        return getExistingPublicModuleSpecifierForSourcePath(source.bundle, file);
    }

    return getPublicModuleSpecifierForSourcePath(source.bundle, file);
}

function findReplacement(file: string, sources: readonly BundleImportRewriteSource[]): Maybe<Replacement> {
    for (const source of sources) {
        const { bundle } = source;
        const targetPath = getReplacementTargetPath(source, file);
        if (targetPath !== undefined) {
            return Maybe.just({
                targetPath,
                packageName: bundle.name
            });
        }
        if (needsImportReplacement(file) && ownsSourcePath(file, bundle)) {
            throw new Error(`Package "${bundle.name}" does not expose "${file}" for cross-package substitution`);
        }
    }

    return Maybe.nothing();
}

export function findAllPathReplacements(
    files: readonly string[],
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): Replacements {
    const sources: readonly BundleImportRewriteSource[] = [
        ...bundleDependencies.map(function (bundle) {
            return { bundle, exportPolicy: 'mayAddExport' } as const;
        }),
        ...bundlePeerDependencies.map(function (bundle) {
            return { bundle, exportPolicy: 'existingExportOnly' } as const;
        })
    ];
    const matched = files.flatMap(function (file) {
        const result = findReplacement(file, sources);
        if (!result.isJust) {
            return [];
        }
        const { targetPath, packageName } = result.value;
        return [ { file, targetPath, packageName } ];
    });

    return {
        importPathReplacements: new Map(
            matched.map(function (entry) {
                return [ entry.file, entry.targetPath ];
            })
        ),
        bundleDependencies: matched.map(function (entry) {
            return entry.packageName;
        })
    };
}
