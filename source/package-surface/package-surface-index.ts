import {
    declarationCompanionCandidates
} from '../common/declaration-companion-paths.ts';
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
    readonly inputFilePathBySpecifier: ReadonlyMap<string, string>;
    readonly specifierByInputFilePath: ReadonlyMap<string, string>;
};

type IndexedSpecifierWrite = {
    readonly publicInputFilePath: string | undefined;
    readonly inputFilePaths: readonly string[];
    readonly specifier: string;
};
type PublicModuleIndexBuilder = {
    readonly build: () => PublicModuleIndex;
    readonly recordFirstIndexedPublicSpecifier: (write: IndexedSpecifierWrite) => void;
    readonly recordShortestIndexedPublicSpecifier: (write: IndexedSpecifierWrite) => void;
};

function createPublicModuleIndexBuilder(): PublicModuleIndexBuilder {
    const inputFilePathBySpecifier = new Map<string, string>();
    const specifierByInputFilePath = new Map<string, string>();

    function recordSourceFileSpecifier(inputFilePath: string, candidateSpecifier: string): void {
        const currentSpecifier = specifierByInputFilePath.get(inputFilePath);
        if (currentSpecifier === undefined) {
            specifierByInputFilePath.set(inputFilePath, candidateSpecifier);
        }
    }

    function recordShortestSourceFileSpecifier(inputFilePath: string, candidateSpecifier: string): void {
        const currentSpecifier = specifierByInputFilePath.get(inputFilePath);
        if (currentSpecifier === undefined || candidateSpecifier.length < currentSpecifier.length) {
            specifierByInputFilePath.set(inputFilePath, candidateSpecifier);
        }
    }

    function recordPublicInputFilePath(write: IndexedSpecifierWrite): void {
        const hasPublicSpecifier = inputFilePathBySpecifier.has(write.specifier);
        if (!hasPublicSpecifier && write.publicInputFilePath !== undefined) {
            inputFilePathBySpecifier.set(write.specifier, write.publicInputFilePath);
        }
    }

    return {
        build() {
            return { inputFilePathBySpecifier, specifierByInputFilePath };
        },
        recordFirstIndexedPublicSpecifier(write) {
            for (const inputFilePath of write.inputFilePaths) {
                recordSourceFileSpecifier(inputFilePath, write.specifier);
            }
            recordPublicInputFilePath(write);
        },
        recordShortestIndexedPublicSpecifier(write) {
            for (const inputFilePath of write.inputFilePaths) {
                recordShortestSourceFileSpecifier(inputFilePath, write.specifier);
            }
            recordPublicInputFilePath(write);
        }
    };
}

export function rootInputFilePaths(root: RootFileDescription): readonly string[] {
    if (root.declarationFile === undefined) {
        return [ root.js.inputFilePath ];
    }

    return [ root.js.inputFilePath, root.declarationFile.inputFilePath ];
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
            publicInputFilePath: root.js.inputFilePath,
            inputFilePaths: rootInputFilePaths(root),
            specifier: toPackageSpecifier(bundle.name, entry.export)
        });
    }

    return publicModuleIndex.build();
}

function declarationCompanionSpecifier(bundle: ImplicitModuleBundle, targetFilePath: string): string | undefined {
    const companion = bundle.contents.find(function (entry) {
        const candidatePaths = declarationCompanionCandidates(entry.fileDescription.targetFilePath);
        return candidatePaths.includes(targetFilePath);
    });
    if (companion === undefined) {
        return undefined;
    }
    return toPackageSpecifier(bundle.name, `./${companion.fileDescription.targetFilePath}`);
}

function recordImplicitRootModules(bundle: ImplicitModuleBundle, publicModuleIndex: PublicModuleIndexBuilder): void {
    const defaultRoot = getRoot(bundle, bundle.surface.defaultModuleRoot);
    publicModuleIndex.recordFirstIndexedPublicSpecifier({
        publicInputFilePath: defaultRoot.js.inputFilePath,
        inputFilePaths: rootInputFilePaths(defaultRoot),
        specifier: bundle.name
    });
    for (const root of Object.values(bundle.roots)) {
        if (root.declarationFile !== undefined) {
            publicModuleIndex.recordFirstIndexedPublicSpecifier({
                publicInputFilePath: undefined,
                inputFilePaths: [ root.declarationFile.inputFilePath ],
                specifier: toPackageSpecifier(bundle.name, `./${root.js.targetFilePath}`)
            });
        }
    }
}

function recordImplicitContentModule(
    bundle: ImplicitModuleBundle,
    publicModuleIndex: PublicModuleIndexBuilder,
    entry: ImplicitModuleBundle['contents'][number]
): void {
    const companionSpecifier = declarationCompanionSpecifier(bundle, entry.fileDescription.targetFilePath);
    if (companionSpecifier === undefined) {
        publicModuleIndex.recordFirstIndexedPublicSpecifier({
            publicInputFilePath: entry.fileDescription.inputFilePath,
            inputFilePaths: [ entry.fileDescription.inputFilePath ],
            specifier: toPackageSpecifier(bundle.name, `./${entry.fileDescription.targetFilePath}`)
        });
    } else {
        publicModuleIndex.recordFirstIndexedPublicSpecifier({
            publicInputFilePath: undefined,
            inputFilePaths: [ entry.fileDescription.inputFilePath ],
            specifier: companionSpecifier
        });
    }
}

function indexImplicitPublicModules(bundle: ImplicitModuleBundle): PublicModuleIndex {
    const publicModuleIndex = createPublicModuleIndexBuilder();

    recordImplicitRootModules(bundle, publicModuleIndex);
    for (const entry of bundle.contents) {
        recordImplicitContentModule(bundle, publicModuleIndex, entry);
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
