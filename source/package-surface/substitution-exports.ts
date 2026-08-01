import { isDefined, pickBy } from 'remeda';
import {
    declarationCompanionCandidates,
    isDeclarationCompanionFilePath
} from '../common/declaration-companion-paths.ts';
import { toImportTarget, type BundleLike, type ExportEntry } from './package-shape.ts';

type SubstitutionBundle = Pick<BundleLike, 'contents' | 'name' | 'roots'>;
type BundleContent = BundleLike['contents'][number];
type SubstitutionBundleLookups = {
    readonly contentBySourceFilePath: ReadonlyMap<string, BundleContent>;
    readonly hasDeclarationRoots: boolean;
    readonly targetFilePaths: ReadonlySet<string>;
    readonly rootSourceFilePaths: ReadonlySet<string>;
};
type BundleContentLookups = {
    readonly contentBySourceFilePath: ReadonlyMap<string, BundleContent>;
    readonly targetFilePaths: ReadonlySet<string>;
};

function collectRootSourceFilePaths(bundle: SubstitutionBundle): ReadonlySet<string> {
    const rootSourceFilePaths = new Set<string>();

    for (const root of Object.values(bundle.roots)) {
        rootSourceFilePaths.add(root.js.sourceFilePath);
    }

    return rootSourceFilePaths;
}

function hasDeclarationRoots(bundle: SubstitutionBundle): boolean {
    return Object.values(bundle.roots).some(function (root) {
        return root.declarationFile !== undefined;
    });
}

function collectBundleContentLookups(bundle: SubstitutionBundle): BundleContentLookups {
    const contentBySourceFilePath = new Map<string, BundleContent>();
    const targetFilePaths = new Set<string>();

    for (const entry of bundle.contents) {
        const { sourceFilePath, targetFilePath } = entry.fileDescription;

        if (!contentBySourceFilePath.has(sourceFilePath)) {
            contentBySourceFilePath.set(sourceFilePath, entry);
        }

        targetFilePaths.add(targetFilePath);
    }

    return { contentBySourceFilePath, targetFilePaths };
}

function createSubstitutionBundleLookups(bundle: SubstitutionBundle): SubstitutionBundleLookups {
    const { contentBySourceFilePath, targetFilePaths } = collectBundleContentLookups(bundle);

    return {
        contentBySourceFilePath,
        hasDeclarationRoots: hasDeclarationRoots(bundle),
        targetFilePaths,
        rootSourceFilePaths: collectRootSourceFilePaths(bundle)
    };
}

function findBundleContent(
    bundleName: string,
    contentBySourceFilePath: ReadonlyMap<string, BundleContent>,
    sourceFilePath: string
): BundleContent {
    const content = contentBySourceFilePath.get(sourceFilePath);
    if (content === undefined) {
        throw new Error(`Package "${bundleName}" is missing content for "${sourceFilePath}"`);
    }

    return content;
}

function findDeclarationCompanionTargetPath(
    targetFilePaths: ReadonlySet<string>,
    candidatePaths: readonly string[]
): string | undefined {
    return candidatePaths.find(function (candidatePath) {
        return targetFilePaths.has(candidatePath);
    });
}

function rejectMissingTypedDeclarationCompanion(
    bundleName: string,
    jsTargetFilePath: string,
    candidatePaths: readonly string[]
): never {
    throw new Error(
        `Package "${bundleName}" exposes substituted module "./${jsTargetFilePath}" without declaration companion ${
            candidatePaths.map(toImportTarget).join(' or ')
        }`
    );
}

function existingDeclarationTargetFilePathFor(
    bundleName: string,
    lookups: SubstitutionBundleLookups,
    jsTargetFilePath: string,
    declarationCandidates: readonly string[]
): string | undefined {
    const declarationTargetFilePath = findDeclarationCompanionTargetPath(
        lookups.targetFilePaths,
        declarationCandidates
    );
    if (declarationTargetFilePath !== undefined) {
        return declarationTargetFilePath;
    }
    if (lookups.hasDeclarationRoots) {
        rejectMissingTypedDeclarationCompanion(bundleName, jsTargetFilePath, declarationCandidates);
    }
    return undefined;
}

function declarationTargetFilePathFor(
    bundleName: string,
    lookups: SubstitutionBundleLookups,
    jsTargetFilePath: string
): string | undefined {
    const declarationCandidates = declarationCompanionCandidates(jsTargetFilePath);
    if (declarationCandidates.length === 0) {
        return undefined;
    }

    return existingDeclarationTargetFilePathFor(bundleName, lookups, jsTargetFilePath, declarationCandidates);
}

function buildSubstitutionExportEntry(
    bundleName: string,
    lookups: SubstitutionBundleLookups,
    sourceFilePath: string
): readonly [string, ExportEntry] | undefined {
    if (lookups.rootSourceFilePaths.has(sourceFilePath)) {
        return undefined;
    }

    const content = findBundleContent(bundleName, lookups.contentBySourceFilePath, sourceFilePath);
    const jsTargetFilePath = content.fileDescription.targetFilePath;
    if (isDeclarationCompanionFilePath(jsTargetFilePath)) {
        return [
            `./${jsTargetFilePath}`,
            { types: toImportTarget(jsTargetFilePath) }
        ];
    }
    const declarationTargetFilePath = declarationTargetFilePathFor(bundleName, lookups, jsTargetFilePath);
    return [
        `./${jsTargetFilePath}`,
        pickBy(
            {
                import: toImportTarget(jsTargetFilePath),
                types: declarationTargetFilePath === undefined ? undefined : toImportTarget(declarationTargetFilePath)
            },
            isDefined
        )
    ];
}

export function collectSubstitutionExports(
    bundle: SubstitutionBundle,
    substitutionPublicModuleSourcePaths: ReadonlySet<string>
): Record<string, ExportEntry> {
    const lookups = createSubstitutionBundleLookups(bundle);
    const substitutionExports: Record<string, ExportEntry> = {};

    for (const sourceFilePath of substitutionPublicModuleSourcePaths) {
        const entry = buildSubstitutionExportEntry(bundle.name, lookups, sourceFilePath);
        if (entry !== undefined) {
            const [ exportKey, exportEntry ] = entry;
            substitutionExports[exportKey] = exportEntry;
        }
    }

    return substitutionExports;
}
