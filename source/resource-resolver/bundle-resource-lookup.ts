import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { BundleResource, ResolvedBundle } from './resolved-bundle.ts';
import type { ResolvedRootsAndSurface } from './resource-resolve-options.ts';

function requireFileDescriptionBySourcePath(
    filePath: string,
    resources: readonly BundleResource[]
): TransferableFileDescription {
    const matchingResource = resources.find((resource) => {
        return resource.fileDescription.sourceFilePath === filePath;
    });
    if (matchingResource === undefined) {
        throw new Error(`Failed to resolve resource for root ${filePath}`);
    }
    return matchingResource.fileDescription;
}

function resolveDeclarationFileResource(
    declarationFilePath: string | undefined,
    contents: readonly BundleResource[]
): TransferableFileDescription | undefined {
    return contents.find((resource) => {
        return resource.fileDescription.sourceFilePath === declarationFilePath;
    })?.fileDescription;
}

export function buildResolvedRoots(
    normalized: ResolvedRootsAndSurface,
    contents: readonly BundleResource[]
): ResolvedBundle['roots'] {
    const resolvedRoots: Record<
        string,
        { js: TransferableFileDescription; declarationFile: TransferableFileDescription | undefined }
    > = {};
    for (const [rootId, root] of Object.entries(normalized.roots)) {
        const jsResource = requireFileDescriptionBySourcePath(root.js, contents);
        const declarationFile = resolveDeclarationFileResource(root.declarationFile, contents);
        resolvedRoots[rootId] = { js: jsResource, declarationFile };
    }

    return resolvedRoots;
}
