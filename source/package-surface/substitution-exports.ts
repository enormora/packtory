import { isDefined, pickBy } from 'remeda';
import { toImportTarget, type BundleLike, type ExportEntry } from './package-shape.ts';

type SubstitutionBundle = Pick<BundleLike, 'contents' | 'name' | 'roots'>;
type BundleContent = BundleLike['contents'][number];
type SubstitutionBundleLookups = {
    readonly contentBySourceFilePath: ReadonlyMap<string, BundleContent>;
    readonly targetFilePaths: ReadonlySet<string>;
    readonly rootSourceFilePaths: ReadonlySet<string>;
};
type BundleContentLookups = {
    readonly contentBySourceFilePath: ReadonlyMap<string, BundleContent>;
    readonly targetFilePaths: ReadonlySet<string>;
};
type DeclarationCompanionRule = {
    readonly declarationExtension: string;
    readonly jsExtension: string;
};

function collectRootSourceFilePaths(bundle: SubstitutionBundle): ReadonlySet<string> {
    const rootSourceFilePaths = new Set<string>();

    for (const root of Object.values(bundle.roots)) {
        rootSourceFilePaths.add(root.js.sourceFilePath);
    }

    return rootSourceFilePaths;
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

function declarationCompanionTargetPathFor(
    rule: DeclarationCompanionRule,
    targetFilePaths: ReadonlySet<string>,
    targetFilePath: string
): string | null | undefined {
    if (targetFilePath.endsWith(rule.declarationExtension)) {
        return null;
    }

    if (!targetFilePath.endsWith(rule.jsExtension)) {
        return undefined;
    }

    const targetPathWithoutExtension = targetFilePath.slice(0, -rule.jsExtension.length);
    const declarationTargetFilePath = `${targetPathWithoutExtension}${rule.declarationExtension}`;
    return targetFilePaths.has(declarationTargetFilePath) ? declarationTargetFilePath : undefined;
}

function findDeclarationCompanionTargetPath(
    targetFilePaths: ReadonlySet<string>,
    targetFilePath: string
): string | null | undefined {
    for (
        const rule of [
            { declarationExtension: '.d.mts', jsExtension: '.mjs' },
            { declarationExtension: '.d.cts', jsExtension: '.cjs' },
            { declarationExtension: '.d.ts', jsExtension: '.js' }
        ] as const
    ) {
        const declarationTargetPath = declarationCompanionTargetPathFor(rule, targetFilePaths, targetFilePath);
        if (declarationTargetPath !== undefined) {
            return declarationTargetPath;
        }
    }

    return undefined;
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
    const declarationTargetFilePath = findDeclarationCompanionTargetPath(lookups.targetFilePaths, jsTargetFilePath);
    if (declarationTargetFilePath === null) {
        return undefined;
    }
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
