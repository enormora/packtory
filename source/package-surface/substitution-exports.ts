import { isDefined, pickBy } from 'remeda';
import {
    declarationCompanionCandidates,
    isDeclarationCompanionFilePath
} from '../common/declaration-companion-paths.ts';
import { toImportTarget, type BundleLike, type ExportEntry } from './package-shape.ts';

type SubstitutionBundle = Pick<BundleLike, 'contents' | 'name' | 'roots'>;
type BundleContent = BundleLike['contents'][number];
type SubstitutionBundleLookups = {
    readonly contentByInputFilePath: ReadonlyMap<string, BundleContent>;
    readonly hasDeclarationRoots: boolean;
    readonly targetFilePaths: ReadonlySet<string>;
    readonly rootInputFilePaths: ReadonlySet<string>;
};
type BundleContentLookups = {
    readonly contentByInputFilePath: ReadonlyMap<string, BundleContent>;
    readonly targetFilePaths: ReadonlySet<string>;
};

function collectRootInputFilePaths(bundle: SubstitutionBundle): ReadonlySet<string> {
    const rootInputFilePaths = new Set<string>();

    for (const root of Object.values(bundle.roots)) {
        rootInputFilePaths.add(root.js.inputFilePath);
    }

    return rootInputFilePaths;
}

function hasDeclarationRoots(bundle: SubstitutionBundle): boolean {
    return Object.values(bundle.roots).some(function (root) {
        return root.declarationFile !== undefined;
    });
}

function collectBundleContentLookups(bundle: SubstitutionBundle): BundleContentLookups {
    const contentByInputFilePath = new Map<string, BundleContent>();
    const targetFilePaths = new Set<string>();

    for (const entry of bundle.contents) {
        const { inputFilePath, targetFilePath } = entry.fileDescription;

        if (!contentByInputFilePath.has(inputFilePath)) {
            contentByInputFilePath.set(inputFilePath, entry);
        }

        targetFilePaths.add(targetFilePath);
    }

    return { contentByInputFilePath, targetFilePaths };
}

function createSubstitutionBundleLookups(bundle: SubstitutionBundle): SubstitutionBundleLookups {
    const { contentByInputFilePath, targetFilePaths } = collectBundleContentLookups(bundle);

    return {
        contentByInputFilePath,
        hasDeclarationRoots: hasDeclarationRoots(bundle),
        targetFilePaths,
        rootInputFilePaths: collectRootInputFilePaths(bundle)
    };
}

function findBundleContent(
    bundleName: string,
    contentByInputFilePath: ReadonlyMap<string, BundleContent>,
    inputFilePath: string
): BundleContent {
    const content = contentByInputFilePath.get(inputFilePath);
    if (content === undefined) {
        throw new Error(`Package "${bundleName}" is missing content for "${inputFilePath}"`);
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
    inputFilePath: string
): readonly [string, ExportEntry] | undefined {
    if (lookups.rootInputFilePaths.has(inputFilePath)) {
        return undefined;
    }

    const content = findBundleContent(bundleName, lookups.contentByInputFilePath, inputFilePath);
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

    for (const inputFilePath of substitutionPublicModuleSourcePaths) {
        const entry = buildSubstitutionExportEntry(bundle.name, lookups, inputFilePath);
        if (entry !== undefined) {
            const [ exportKey, exportEntry ] = entry;
            substitutionExports[exportKey] = exportEntry;
        }
    }

    return substitutionExports;
}
