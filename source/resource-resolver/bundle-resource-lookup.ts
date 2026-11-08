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

export function buildResolvedRoots(
    normalized: ResolvedRootsAndSurface,
    contents: readonly BundleResource[]
): ResolvedBundle['roots'] {
    return Object.fromEntries(
        Object.entries(normalized.roots).map(
            function ([ identifier, root ]): readonly [string, ResolvedBundle['roots'][string]] {
                if (root.json !== undefined) {
                    return [ identifier, { json: requireFileDescriptionBySourcePath(root.json, contents) } ];
                }
                if (root.javaScript === undefined) {
                    return [ identifier, {
                        declarationFile: requireFileDescriptionBySourcePath(root.declarationFile, contents)
                    } ];
                }
                return [ identifier, {
                    javaScript: requireFileDescriptionBySourcePath(root.javaScript, contents),
                    declarationFile: contents
                        .find(function (resource) {
                            return resource.fileDescription.inputFilePath === root.declarationFile;
                        })
                        ?.fileDescription
                } ];
            }
        )
    );
}
