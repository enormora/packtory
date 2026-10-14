import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { BundleResource, ResolvedBundle } from './resolved-bundle.ts';
import type { ResolvedRootsAndSurface } from './resource-resolve-options.ts';

function requireFileDescriptionBySourcePath(
    filePath: string,
    resources: readonly BundleResource[]
): TransferableFileDescription {
    const matchingResource = resources.find(function (resource) {
        return resource.fileDescription.inputFilePath === filePath;
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
    return contents
        .find(function (resource) {
            return resource.fileDescription.inputFilePath === declarationFilePath;
        })
        ?.fileDescription;
}

export function buildResolvedRoots(
    normalized: ResolvedRootsAndSurface,
    contents: readonly BundleResource[]
): ResolvedBundle['roots'] {
    const resolvedRoots: Record<
        string,
        {
            readonly javaScript: TransferableFileDescription;
            readonly declarationFile: TransferableFileDescription | undefined;
        }
    > = {};
    for (const [ rootIdentifier, root ] of Object.entries(normalized.roots)) {
        const javaScriptResource = requireFileDescriptionBySourcePath(root.javaScript, contents);
        const declarationFile = resolveDeclarationFileResource(root.declarationFile, contents);
        resolvedRoots[rootIdentifier] = { javaScript: javaScriptResource, declarationFile };
    }

    return resolvedRoots;
}
