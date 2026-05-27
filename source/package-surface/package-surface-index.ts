import type { BundleLike, ExplicitSurface, ImplicitSurface, RootFileDescription } from './package-shape.ts';
import { getEntryRootIds, getRoot } from './root-registry.ts';
import { toPackageSpecifier } from './specifier-syntax.ts';

type SummaryBundle = Pick<BundleLike, 'name' | 'roots' | 'surface'>;
type ExplicitSummaryBundle = Pick<BundleLike, 'name' | 'roots'> & {
    readonly surface: ExplicitSurface;
};
type ImplicitSummaryBundle = Pick<BundleLike, 'name' | 'roots'> & {
    readonly surface: ImplicitSurface;
};
type ExplicitModuleBundle = Pick<BundleLike, 'contents' | 'name' | 'roots'> & {
    readonly surface: ExplicitSurface;
};
type ImplicitModuleBundle = Pick<BundleLike, 'contents' | 'name' | 'roots'> & {
    readonly surface: ImplicitSurface;
};
type PublicModuleBundle = BundleLike;

export type PackageSurfaceSummary = {
    readonly publicRootIds: ReadonlySet<string>;
    readonly representativeRootId: string;
};

export type PublicModuleIndex = {
    readonly sourceFilePathBySpecifier: ReadonlyMap<string, string>;
    readonly specifierBySourceFilePath: ReadonlyMap<string, string>;
};

type MutablePublicModuleIndex = {
    readonly sourceFilePathBySpecifier: Map<string, string>;
    readonly specifierBySourceFilePath: Map<string, string>;
};
type IndexedSpecifierWrite = {
    readonly publicSourceFilePath: string | undefined;
    readonly sourceFilePaths: readonly string[];
    readonly specifier: string;
};

function createMutablePublicModuleIndex(): MutablePublicModuleIndex {
    return {
        sourceFilePathBySpecifier: new Map<string, string>(),
        specifierBySourceFilePath: new Map<string, string>()
    };
}

function recordSourceFileSpecifier(
    publicModuleIndex: MutablePublicModuleIndex,
    sourceFilePath: string,
    candidateSpecifier: string
): void {
    const currentSpecifier = publicModuleIndex.specifierBySourceFilePath.get(sourceFilePath);
    if (currentSpecifier === undefined) {
        publicModuleIndex.specifierBySourceFilePath.set(sourceFilePath, candidateSpecifier);
    }
}

function recordShortestSourceFileSpecifier(
    publicModuleIndex: MutablePublicModuleIndex,
    sourceFilePath: string,
    candidateSpecifier: string
): void {
    const currentSpecifier = publicModuleIndex.specifierBySourceFilePath.get(sourceFilePath);
    if (currentSpecifier === undefined || candidateSpecifier.length < currentSpecifier.length) {
        publicModuleIndex.specifierBySourceFilePath.set(sourceFilePath, candidateSpecifier);
    }
}

function recordPublicSourceFilePath(publicModuleIndex: MutablePublicModuleIndex, write: IndexedSpecifierWrite): void {
    const hasPublicSpecifier = publicModuleIndex.sourceFilePathBySpecifier.has(write.specifier);
    if (write.publicSourceFilePath !== undefined && !hasPublicSpecifier) {
        publicModuleIndex.sourceFilePathBySpecifier.set(write.specifier, write.publicSourceFilePath);
    }
}

function recordFirstIndexedPublicSpecifier(
    publicModuleIndex: MutablePublicModuleIndex,
    write: IndexedSpecifierWrite
): void {
    for (const sourceFilePath of write.sourceFilePaths) {
        recordSourceFileSpecifier(publicModuleIndex, sourceFilePath, write.specifier);
    }
    recordPublicSourceFilePath(publicModuleIndex, write);
}

function recordShortestIndexedPublicSpecifier(
    publicModuleIndex: MutablePublicModuleIndex,
    write: IndexedSpecifierWrite
): void {
    for (const sourceFilePath of write.sourceFilePaths) {
        recordShortestSourceFileSpecifier(publicModuleIndex, sourceFilePath, write.specifier);
    }
    recordPublicSourceFilePath(publicModuleIndex, write);
}

function rootSourceFilePaths(root: RootFileDescription): readonly string[] {
    if (root.declarationFile === undefined) {
        return [root.js.sourceFilePath];
    }

    return [root.js.sourceFilePath, root.declarationFile.sourceFilePath];
}

function isExplicitSummaryBundle(bundle: SummaryBundle): bundle is ExplicitSummaryBundle {
    return bundle.surface.mode === 'explicit';
}

function isImplicitSummaryBundle(bundle: SummaryBundle): bundle is ImplicitSummaryBundle {
    return bundle.surface.mode === 'implicit';
}

function isExplicitModuleBundle(bundle: PublicModuleBundle): bundle is ExplicitModuleBundle {
    return bundle.surface.mode === 'explicit';
}

function isImplicitModuleBundle(bundle: PublicModuleBundle): bundle is ImplicitModuleBundle {
    return bundle.surface.mode === 'implicit';
}

function firstExplicitRootId(surface: ExplicitSurface): string | undefined {
    return surface.packageInterface.modules?.[0]?.root ?? surface.packageInterface.bins?.[0]?.root;
}

function summarizeImplicitPackageSurface(bundle: ImplicitSummaryBundle): PackageSurfaceSummary {
    return {
        publicRootIds: getEntryRootIds(bundle),
        representativeRootId: bundle.surface.defaultModuleRoot
    };
}

function summarizeExplicitPackageSurface(bundle: ExplicitSummaryBundle): PackageSurfaceSummary {
    const representativeRootId = firstExplicitRootId(bundle.surface);
    if (representativeRootId === undefined) {
        throw new Error(`Package "${bundle.name}" explicit surface declares neither modules nor bins`);
    }

    return {
        publicRootIds: getEntryRootIds(bundle),
        representativeRootId
    };
}

export function summarizePackageSurface(bundle: SummaryBundle): PackageSurfaceSummary {
    if (isExplicitSummaryBundle(bundle)) {
        return summarizeExplicitPackageSurface(bundle);
    }

    if (isImplicitSummaryBundle(bundle)) {
        return summarizeImplicitPackageSurface(bundle);
    }

    throw new Error(`Unsupported package surface mode: ${bundle.surface.mode}`);
}

function indexExplicitPublicModules(bundle: ExplicitModuleBundle): PublicModuleIndex {
    const publicModuleIndex = createMutablePublicModuleIndex();
    const { modules } = bundle.surface.packageInterface;

    if (modules === undefined) {
        return publicModuleIndex;
    }

    for (const entry of modules) {
        const root = getRoot(bundle, entry.root);
        recordShortestIndexedPublicSpecifier(publicModuleIndex, {
            publicSourceFilePath: root.js.sourceFilePath,
            sourceFilePaths: rootSourceFilePaths(root),
            specifier: toPackageSpecifier(bundle.name, entry.export)
        });
    }

    return publicModuleIndex;
}

function indexImplicitPublicModules(bundle: ImplicitModuleBundle): PublicModuleIndex {
    const publicModuleIndex = createMutablePublicModuleIndex();
    const defaultRoot = getRoot(bundle, bundle.surface.defaultModuleRoot);

    recordFirstIndexedPublicSpecifier(publicModuleIndex, {
        publicSourceFilePath: defaultRoot.js.sourceFilePath,
        sourceFilePaths: rootSourceFilePaths(defaultRoot),
        specifier: bundle.name
    });
    for (const root of Object.values(bundle.roots)) {
        if (root.declarationFile !== undefined) {
            recordFirstIndexedPublicSpecifier(publicModuleIndex, {
                publicSourceFilePath: undefined,
                sourceFilePaths: [root.declarationFile.sourceFilePath],
                specifier: toPackageSpecifier(bundle.name, `./${root.js.targetFilePath}`)
            });
        }
    }
    for (const entry of bundle.contents) {
        recordFirstIndexedPublicSpecifier(publicModuleIndex, {
            publicSourceFilePath: entry.fileDescription.sourceFilePath,
            sourceFilePaths: [entry.fileDescription.sourceFilePath],
            specifier: toPackageSpecifier(bundle.name, `./${entry.fileDescription.targetFilePath}`)
        });
    }

    return publicModuleIndex;
}

export function indexPublicModules(bundle: PublicModuleBundle): PublicModuleIndex {
    if (isExplicitModuleBundle(bundle)) {
        return indexExplicitPublicModules(bundle);
    }

    if (isImplicitModuleBundle(bundle)) {
        return indexImplicitPublicModules(bundle);
    }

    throw new Error(`Unsupported package surface mode: ${bundle.surface.mode}`);
}
