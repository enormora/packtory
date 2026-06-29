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

type IndexedSpecifierWrite = {
    readonly publicSourceFilePath: string | undefined;
    readonly sourceFilePaths: readonly string[];
    readonly specifier: string;
};
type PublicModuleIndexBuilder = {
    readonly build: () => PublicModuleIndex;
    readonly recordFirstIndexedPublicSpecifier: (write: IndexedSpecifierWrite) => void;
    readonly recordShortestIndexedPublicSpecifier: (write: IndexedSpecifierWrite) => void;
};

function createPublicModuleIndexBuilder(): PublicModuleIndexBuilder {
    const sourceFilePathBySpecifier = new Map<string, string>();
    const specifierBySourceFilePath = new Map<string, string>();

    function recordSourceFileSpecifier(sourceFilePath: string, candidateSpecifier: string): void {
        const currentSpecifier = specifierBySourceFilePath.get(sourceFilePath);
        if (currentSpecifier === undefined) {
            specifierBySourceFilePath.set(sourceFilePath, candidateSpecifier);
        }
    }

    function recordShortestSourceFileSpecifier(sourceFilePath: string, candidateSpecifier: string): void {
        const currentSpecifier = specifierBySourceFilePath.get(sourceFilePath);
        if (currentSpecifier === undefined || candidateSpecifier.length < currentSpecifier.length) {
            specifierBySourceFilePath.set(sourceFilePath, candidateSpecifier);
        }
    }

    function recordPublicSourceFilePath(write: IndexedSpecifierWrite): void {
        const hasPublicSpecifier = sourceFilePathBySpecifier.has(write.specifier);
        if (write.publicSourceFilePath !== undefined && !hasPublicSpecifier) {
            sourceFilePathBySpecifier.set(write.specifier, write.publicSourceFilePath);
        }
    }

    return {
        build() {
            return { sourceFilePathBySpecifier, specifierBySourceFilePath };
        },
        recordFirstIndexedPublicSpecifier(write) {
            for (const sourceFilePath of write.sourceFilePaths) {
                recordSourceFileSpecifier(sourceFilePath, write.specifier);
            }
            recordPublicSourceFilePath(write);
        },
        recordShortestIndexedPublicSpecifier(write) {
            for (const sourceFilePath of write.sourceFilePaths) {
                recordShortestSourceFileSpecifier(sourceFilePath, write.specifier);
            }
            recordPublicSourceFilePath(write);
        }
    };
}

function rootSourceFilePaths(root: RootFileDescription): readonly string[] {
    if (root.declarationFile === undefined) {
        return [ root.js.sourceFilePath ];
    }

    return [ root.js.sourceFilePath, root.declarationFile.sourceFilePath ];
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
    const publicModuleIndex = createPublicModuleIndexBuilder();
    const { modules } = bundle.surface.packageInterface;

    if (modules === undefined) {
        return publicModuleIndex.build();
    }

    for (const entry of modules) {
        const root = getRoot(bundle, entry.root);
        publicModuleIndex.recordShortestIndexedPublicSpecifier({
            publicSourceFilePath: root.js.sourceFilePath,
            sourceFilePaths: rootSourceFilePaths(root),
            specifier: toPackageSpecifier(bundle.name, entry.export)
        });
    }

    return publicModuleIndex.build();
}

function indexImplicitPublicModules(bundle: ImplicitModuleBundle): PublicModuleIndex {
    const publicModuleIndex = createPublicModuleIndexBuilder();
    const defaultRoot = getRoot(bundle, bundle.surface.defaultModuleRoot);

    publicModuleIndex.recordFirstIndexedPublicSpecifier({
        publicSourceFilePath: defaultRoot.js.sourceFilePath,
        sourceFilePaths: rootSourceFilePaths(defaultRoot),
        specifier: bundle.name
    });
    for (const root of Object.values(bundle.roots)) {
        if (root.declarationFile !== undefined) {
            publicModuleIndex.recordFirstIndexedPublicSpecifier({
                publicSourceFilePath: undefined,
                sourceFilePaths: [ root.declarationFile.sourceFilePath ],
                specifier: toPackageSpecifier(bundle.name, `./${root.js.targetFilePath}`)
            });
        }
    }
    for (const entry of bundle.contents) {
        publicModuleIndex.recordFirstIndexedPublicSpecifier({
            publicSourceFilePath: entry.fileDescription.sourceFilePath,
            sourceFilePaths: [ entry.fileDescription.sourceFilePath ],
            specifier: toPackageSpecifier(bundle.name, `./${entry.fileDescription.targetFilePath}`)
        });
    }

    return publicModuleIndex.build();
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
