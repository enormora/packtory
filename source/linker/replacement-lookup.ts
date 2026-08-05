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

type Replacement = {
    readonly targetPath: string;
    readonly packageName: string;
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

function createContentLookup(bundle: BundleSubstitutionSource): ContentLookup {
    const contentBySourcePath = new Map<string, BundleSubstitutionSource['contents'][number]>();
    const sourcePathByTargetPath = new Map<string, string>();
    for (const content of bundle.contents) {
        contentBySourcePath.set(content.fileDescription.sourceFilePath, content);
        sourcePathByTargetPath.set(content.fileDescription.targetFilePath, content.fileDescription.sourceFilePath);
    }
    return { contentBySourcePath, sourcePathByTargetPath };
}

type PossibleModuleSpecifierStatement = Readonly<typescript.Statement> & {
    readonly moduleSpecifier?: typescript.Node;
};

function exportDeclarationModuleSpecifier(
    statement: Readonly<typescript.Statement>
): PossibleModuleSpecifierStatement | undefined {
    if (!typescript.isExportDeclaration(statement)) {
        return undefined;
    }
    return statement;
}

function moduleSpecifierText(statement: PossibleModuleSpecifierStatement): string | undefined {
    const { moduleSpecifier } = statement;
    if (moduleSpecifier === undefined) {
        return undefined;
    }
    return typescript.isStringLiteral(moduleSpecifier) ? moduleSpecifier.text : undefined;
}

function exportedModuleSpecifiers(content: string): readonly string[] {
    const sourceFile = typescript.createSourceFile(
        content,
        content,
        typescript.ScriptTarget.Latest
    );
    return sourceFile
        .statements
        .map(exportDeclarationModuleSpecifier)
        .filter(isDefined)
        .map(moduleSpecifierText)
        .filter(isDefined);
}

function exportedTargetPath(currentTargetFilePath: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) {
        return undefined;
    }
    return path.posix.normalize(path.posix.join(path.posix.dirname(currentTargetFilePath), specifier));
}

function enqueueExportedSourceFilePaths(
    lookup: ContentLookup,
    pending: SourceFilePathQueue,
    currentTargetFilePath: string,
    specifier: string
): void {
    const targetPath = exportedTargetPath(currentTargetFilePath, specifier);
    if (targetPath === undefined) {
        return;
    }
    const sourcePaths = [ targetPath, ...declarationCompanionCandidates(targetPath) ]
        .map(function (candidate) {
            return lookup.sourcePathByTargetPath.get(candidate);
        })
        .filter(isDefined);
    for (const sourcePath of sourcePaths) {
        pending.push(sourcePath);
    }
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
    sourceFilePath: string
): string | undefined {
    const lookup = createContentLookup(bundle);
    const specifiersBySourcePath = new Map<string, string>();
    const moduleEntries = surface.packageInterface.modules ?? [];
    for (const moduleEntry of moduleEntries) {
        const root = getRoot(bundle, moduleEntry.root);
        const rootPaths = rootSourceFilePaths(root);
        recordShortestSpecifier(
            specifiersBySourcePath,
            publicExportedSourceFilePaths(rootPaths, lookup),
            toPackageSpecifier(bundle.name, moduleEntry.export)
        );
    }

    return specifiersBySourcePath.get(sourceFilePath);
}

function getImplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    surface: ImplicitPackageSurface,
    sourceFilePath: string
): string | undefined {
    const lookup = createContentLookup(bundle);
    const specifiersBySourcePath = new Map<string, string>();
    const defaultRoot = getRoot(bundle, surface.defaultModuleRoot);
    recordShortestSpecifier(
        specifiersBySourcePath,
        publicExportedSourceFilePaths(rootSourceFilePaths(defaultRoot), lookup),
        bundle.name
    );

    for (const root of Object.values(bundle.roots)) {
        recordShortestSpecifier(
            specifiersBySourcePath,
            publicExportedSourceFilePaths(rootSourceFilePaths(root), lookup),
            toPackageSpecifier(bundle.name, `./${root.js.targetFilePath}`)
        );
    }

    return specifiersBySourcePath.get(sourceFilePath) ?? getPublicModuleSpecifierForSourcePath(bundle, sourceFilePath);
}

function getExistingPublicModuleSpecifierForSourcePath(
    bundle: BundleSubstitutionSource,
    sourceFilePath: string
): string | undefined {
    const { surface } = bundle;
    if (surface.mode === 'implicit') {
        return getImplicitPublicModuleSpecifierForSourcePath(bundle, surface, sourceFilePath);
    }

    return getExplicitPublicModuleSpecifierForSourcePath(bundle, surface, sourceFilePath);
}

function findReplacementInBundles(
    file: string,
    bundles: readonly BundleSubstitutionSource[],
    getTargetPath: (bundle: BundleSubstitutionSource, sourceFilePath: string) => string | undefined
): Replacement | undefined {
    for (const bundle of bundles) {
        const targetPath = getTargetPath(bundle, file);
        if (targetPath !== undefined) {
            return {
                targetPath,
                packageName: bundle.name
            };
        }
        if (needsImportReplacement(file) && ownsSourcePath(file, bundle)) {
            throw new Error(`Package "${bundle.name}" does not expose "${file}" for cross-package substitution`);
        }
    }

    return undefined;
}

function findReplacement(
    file: string,
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): Replacement | undefined {
    const dependencyReplacement = findReplacementInBundles(
        file,
        bundleDependencies,
        getPublicModuleSpecifierForSourcePath
    );
    if (dependencyReplacement !== undefined) {
        return dependencyReplacement;
    }
    return findReplacementInBundles(file, bundlePeerDependencies, getExistingPublicModuleSpecifierForSourcePath);
}

export function findAllPathReplacements(
    files: readonly string[],
    bundleDependencies: readonly BundleSubstitutionSource[],
    bundlePeerDependencies: readonly BundleSubstitutionSource[]
): Replacements {
    const importPathReplacements = new Map<string, string>();
    const matchedBundleDependencies: string[] = [];

    for (const file of files) {
        const replacement = findReplacement(file, bundleDependencies, bundlePeerDependencies);
        if (replacement !== undefined) {
            importPathReplacements.set(file, replacement.targetPath);
            matchedBundleDependencies.push(replacement.packageName);
        }
    }

    return {
        importPathReplacements,
        bundleDependencies: matchedBundleDependencies
    };
}
