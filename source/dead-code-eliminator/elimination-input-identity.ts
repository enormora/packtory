import { contentDigest, valueFingerprint } from '../common/value-fingerprint.ts';
import type { EliminationInput } from './analyzed-bundle.ts';

function bundleInputIdentity(input: EliminationInput): string {
    const { bundle } = input;
    return valueFingerprint({
        ...input,
        bundle: {
            ...bundle,
            contents: bundle.contents.map(function (resource) {
                return valueFingerprint({
                    ...resource,
                    fileDescription: {
                        ...resource.fileDescription,
                        content: contentDigest(resource.fileDescription.content)
                    }
                });
            }),
            roots: Object.fromEntries(
                Object.entries(bundle.roots).map(function ([ name, root ]) {
                    return [ name, valueFingerprint(root) ];
                })
            ),
            sourceMapTransformsByTargetPath: new Map(Array.from(
                bundle.sourceMapTransformsByTargetPath,
                function ([ target, transforms ]) {
                    return [ target, transforms.map(valueFingerprint) ];
                }
            ))
        }
    });
}

export function eliminationInputIdentity(inputs: readonly EliminationInput[]): string | null {
    try {
        return valueFingerprint(inputs.map(bundleInputIdentity));
    } catch {
        return null;
    }
}
