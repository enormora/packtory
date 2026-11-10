import type { Node as TypeScriptMorphNode } from 'ts-morph';
import { bindingIdentifier, type FileBindings } from './binding-identifier.ts';

export function observeReachableBindings(
    files: readonly FileBindings[],
    reachable: ReadonlySet<string> | undefined
): (reference: TypeScriptMorphNode) => boolean {
    const owners = new Map<TypeScriptMorphNode, Set<string>>();
    for (const file of files) {
        for (const binding of file.bindings) {
            const identifiers = owners.get(binding.referenceNode) ?? new Set<string>();
            identifiers.add(bindingIdentifier(file.targetFilePath, binding.name));
            owners.set(binding.referenceNode, identifiers);
        }
    }
    return function (reference) {
        if (reachable === undefined) {
            return true;
        }
        const identifiers = [ reference, ...reference.getAncestors() ]
            .map(function (node) {
                return owners.get(node);
            })
            .find(function (owner) {
                return owner !== undefined;
            });
        return identifiers === undefined || Array.from(identifiers).some(function (identifier) {
            return reachable.has(identifier);
        });
    };
}
