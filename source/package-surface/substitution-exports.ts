import { toImportTarget, type BundleLike, type ExportEntry } from './package-shape.ts';

type SubstitutionBundle = Pick<BundleLike, 'contents' | 'name' | 'roots'>;

const jsExtensionToDeclarationExtension: ReadonlyMap<string, string> = new Map([
    ['.mjs', '.d.mts'],
    ['.cjs', '.d.cts'],
    ['.js', '.d.ts']
]);

function isRootSourcePath(bundle: Pick<BundleLike, 'roots'>, sourceFilePath: string): boolean {
    return Object.values(bundle.roots).some((root) => {
        return root.js.sourceFilePath === sourceFilePath;
    });
}

function isDeclarationTargetFilePath(targetFilePath: string): boolean {
    return targetFilePath.endsWith('.d.ts') || targetFilePath.endsWith('.d.mts') || targetFilePath.endsWith('.d.cts');
}

function findContent(bundle: SubstitutionBundle, sourceFilePath: string): BundleLike['contents'][number] {
    const content = bundle.contents.find((entry) => {
        return entry.fileDescription.sourceFilePath === sourceFilePath;
    });
    if (content === undefined) {
        throw new Error(`Package "${bundle.name}" is missing content for "${sourceFilePath}"`);
    }
    return content;
}

function findContentTargetPath(bundle: SubstitutionBundle, targetFilePath: string): string | undefined {
    const match = bundle.contents.find((entry) => {
        return entry.fileDescription.targetFilePath === targetFilePath;
    });
    return match?.fileDescription.targetFilePath;
}

function findDeclarationCompanionTargetPath(bundle: SubstitutionBundle, jsTargetFilePath: string): string | undefined {
    for (const [jsExtension, declarationExtension] of jsExtensionToDeclarationExtension) {
        if (jsTargetFilePath.endsWith(jsExtension)) {
            const candidatePath = `${jsTargetFilePath.slice(0, -jsExtension.length)}${declarationExtension}`;
            return findContentTargetPath(bundle, candidatePath);
        }
    }
    return undefined;
}

function buildSubstitutionExportEntry(
    bundle: SubstitutionBundle,
    sourceFilePath: string
): readonly [string, ExportEntry] | undefined {
    if (isRootSourcePath(bundle, sourceFilePath)) {
        return undefined;
    }

    const jsTargetFilePath = findContent(bundle, sourceFilePath).fileDescription.targetFilePath;
    if (isDeclarationTargetFilePath(jsTargetFilePath)) {
        return undefined;
    }

    const declarationTargetFilePath = findDeclarationCompanionTargetPath(bundle, jsTargetFilePath);
    return [
        `./${jsTargetFilePath}`,
        {
            import: toImportTarget(jsTargetFilePath),
            ...(declarationTargetFilePath === undefined ? {} : { types: toImportTarget(declarationTargetFilePath) })
        }
    ];
}

export function collectSubstitutionExports(
    bundle: SubstitutionBundle,
    substitutionPublicModuleSourcePaths: ReadonlySet<string>
): Record<string, ExportEntry> {
    const substitutionExports: Record<string, ExportEntry> = {};

    for (const sourceFilePath of substitutionPublicModuleSourcePaths) {
        const entry = buildSubstitutionExportEntry(bundle, sourceFilePath);
        if (entry !== undefined) {
            const [exportKey, exportEntry] = entry;
            substitutionExports[exportKey] = exportEntry;
        }
    }

    return substitutionExports;
}
