import type { PositionAtom } from './declaration-remover.ts';

function findAtomFor(atoms: readonly PositionAtom[], offset: number): PositionAtom | undefined {
    return atoms.find((atom) => {
        return offset >= atom.originalStart && offset < atom.originalEnd;
    });
}

export function translateGeneratedOffset(offset: number, atoms: readonly PositionAtom[]): number | undefined {
    const atom = findAtomFor(atoms, offset);
    if (atom === undefined) {
        return undefined;
    }
    return atom.newStart + (offset - atom.originalStart);
}
