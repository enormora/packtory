import type { DeclarationNodeIndex } from './binding-identifier.ts';

const runtimeCompanionsByIndex = new WeakMap<DeclarationNodeIndex, ReadonlySet<string>>();

export function declarationTypeTargets(
    targets: ReadonlySet<string>,
    index: DeclarationNodeIndex
): Set<string> {
    const companions = runtimeCompanionsByIndex.get(index) ?? new Set(
        Array.from(index.identifiersByNode.values()).flatMap(function (identifiers) {
            return identifiers.slice(1);
        })
    );
    runtimeCompanionsByIndex.set(index, companions);
    return targets.difference(companions);
}
