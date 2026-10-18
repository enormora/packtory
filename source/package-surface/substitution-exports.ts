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
        rootInputFilePaths.add(root.javaScript.inputFilePath);
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
    javaScriptTargetFilePath: string,
    candidatePaths: readonly string[]
): never {
    const moduleDescription = `Package "${bundleName}" exposes substituted module "./${javaScriptTargetFilePath}" `;
    const companions = candidatePaths.map(toImportTarget).join(' or ');
    throw new Error(
        `${moduleDescription}without declaration companion ${companions}`
    );
}

function existingDeclarationTargetFilePathFor(
    bundleName: string,
    lookups: SubstitutionBundleLookups,
    javaScriptTargetFilePath: string,
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
        rejectMissingTypedDeclarationCompanion(bundleName, javaScriptTargetFilePath, declarationCandidates);
    }
    return undefined;
}

function declarationTargetFilePathFor(
    bundleName: string,
    lookups: SubstitutionBundleLookups,
    javaScriptTargetFilePath: string
): string | undefined {
    const declarationCandidates = declarationCompanionCandidates(javaScriptTargetFilePath);
    if (declarationCandidates.length === 0) {
        return undefined;
    }

    return existingDeclarationTargetFilePathFor(bundleName, lookups, javaScriptTargetFilePath, declarationCandidates);
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
    const javaScriptTargetFilePath = content.fileDescription.targetFilePath;
    if (isDeclarationCompanionFilePath(javaScriptTargetFilePath)) {
        return [
            `./${javaScriptTargetFilePath}`,
            { types: toImportTarget(javaScriptTargetFilePath) }
        ];
    }
    const declarationTargetFilePath = declarationTargetFilePathFor(bundleName, lookups, javaScriptTargetFilePath);
    return [
        `./${javaScriptTargetFilePath}`,
        pickBy(
            {
                import: toImportTarget(javaScriptTargetFilePath),
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
    const entries = Array
        .from(substitutionPublicModuleSourcePaths, function substitutionExport(inputFilePath) {
            return buildSubstitutionExportEntry(bundle.name, lookups, inputFilePath);
        })
        .filter(isDefined);
    return Object.fromEntries(entries);
}
