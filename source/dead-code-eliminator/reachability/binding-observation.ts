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
        const owner = [ reference, ...reference.getAncestors() ].find(function (node) {
            return owners.has(node);
        });
        const identifiers = owner === undefined ? undefined : owners.get(owner);
        return identifiers === undefined || Array.from(identifiers).some(function (identifier) {
            return reachable.has(identifier);
        });
    };
}
