import type { FileDescription } from '../file-manager/file-description.ts';
import type {
    ArtifactEntry,
    ExcludedFile,
    FieldProvenance,
    ImportRewrite,
    IncludedFile
} from '../progress/event-payloads.ts';

function inferArtifactKind(filePath: string): ArtifactEntry['kind'] {
    if (filePath === 'package.json' || filePath.endsWith('/package.json')) {
        return 'manifest';
    }
    if (filePath.endsWith('.sbom.json') || filePath.endsWith('.cdx.json')) {
        return 'sbom';
    }
    if (/\.(?:c?js|d\.[cm]?ts|jsx?|map|mjs|tsx?)$/.test(filePath)) {
        return 'source';
    }
    return 'additional';
}

export function inspectArtifactSizes(contents: readonly FileDescription[]): readonly ArtifactEntry[] {
    return contents.map((entry) => {
        return {
            path: entry.filePath,
            sizeBytes: Buffer.byteLength(entry.content, 'utf8'),
            kind: inferArtifactKind(entry.filePath)
        };
    });
}

type ResolvedBundleLike = {
    readonly contents: readonly { readonly fileDescription: { readonly sourceFilePath: string } }[];
    readonly externalDependencies: ReadonlyMap<string, unknown>;
};

export function inspectScanResults(bundle: ResolvedBundleLike): {
    readonly included: readonly IncludedFile[];
    readonly excluded: readonly ExcludedFile[];
} {
    const included: IncludedFile[] = bundle.contents.map((entry) => {
        return { path: entry.fileDescription.sourceFilePath, reason: 'reachable-from-entry' };
    });
    const excluded: ExcludedFile[] = Array.from(bundle.externalDependencies.keys(), (specifier) => {
        return { specifier, reason: 'external-module' };
    });
    return { included, excluded };
}

type LinkedBundleLike = {
    readonly contents: readonly {
        readonly fileDescription: { readonly sourceFilePath: string };
        readonly isSubstituted: boolean;
    }[];
    readonly linkedBundleDependencies: ReadonlyMap<string, unknown>;
};

export function inspectLinkerRewrites(bundle: LinkedBundleLike): readonly ImportRewrite[] {
    const linkedBundleNames = Array.from(bundle.linkedBundleDependencies.keys());
    return bundle.contents.flatMap((resource) => {
        if (!resource.isSubstituted) {
            return [];
        }
        return linkedBundleNames.map((targetBundle) => {
            return {
                file: resource.fileDescription.sourceFilePath,
                fromSpecifier: resource.fileDescription.sourceFilePath,
                toSpecifier: targetBundle,
                targetBundle
            };
        });
    });
}

export function inspectPackageJsonProvenance(
    assembled: Readonly<Record<string, unknown>>,
    mainPackageJson: Readonly<Record<string, unknown>>,
    additionalAttributes: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, FieldProvenance>> {
    const result: Record<string, FieldProvenance> = {};
    for (const key of Object.keys(assembled)) {
        if (additionalAttributes !== undefined && key in additionalAttributes) {
            result[key] = { source: 'additionalAttributes' };
        } else if (key in mainPackageJson) {
            result[key] = { source: 'mainPackageJson' };
        } else {
            result[key] = { source: 'derived' };
        }
    }
    return result;
}
