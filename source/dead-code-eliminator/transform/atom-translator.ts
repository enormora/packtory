import { diffChars } from 'diff';
import { buildLineIndex, type LineIndex } from './line-index.ts';

export type PositionAtom = {
    readonly originalStart: number;
    readonly originalEnd: number;
    readonly newStart: number;
};

export type TextTransformMap = {
    readonly originalCode: string;
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
};

export type SourceMapTransform = {
    readonly originalLineIndex: LineIndex;
    readonly transformedLineIndex: LineIndex;
    readonly atoms: readonly PositionAtom[];
};

type AtomState = {
    readonly originalOffset: number;
    readonly transformedOffset: number;
    readonly atoms: readonly PositionAtom[];
};

type TextChange = Readonly<ReturnType<typeof diffChars>[number]>;

const initialState: AtomState = {
    originalOffset: 0,
    transformedOffset: 0,
    atoms: []
};

function appendAtom(state: AtomState, length: number): AtomState {
    return {
        originalOffset: state.originalOffset + length,
        transformedOffset: state.transformedOffset + length,
        atoms: [
            ...state.atoms,
            {
                originalStart: state.originalOffset,
                originalEnd: state.originalOffset + length,
                newStart: state.transformedOffset
            }
        ]
    };
}

function shiftOffsets(state: AtomState, change: TextChange, length: number): AtomState {
    return {
        originalOffset: state.originalOffset + (change.removed ? length : 0),
        transformedOffset: state.transformedOffset + (change.added ? length : 0),
        atoms: state.atoms
    };
}

function appendChange(state: AtomState, change: TextChange): AtomState {
    const { length } = change.value;
    return change.added || change.removed ? shiftOffsets(state, change, length) : appendAtom(state, length);
}

export function buildTextTransformMap(originalCode: string, transformedCode: string): TextTransformMap {
    const state = diffChars(originalCode, transformedCode).reduce(appendChange, initialState);
    return { originalCode, transformedCode, atoms: state.atoms };
}

export function toSourceMapTransform(textTransform: TextTransformMap): SourceMapTransform {
    return {
        originalLineIndex: buildLineIndex(textTransform.originalCode),
        transformedLineIndex: buildLineIndex(textTransform.transformedCode),
        atoms: textTransform.atoms
    };
}

function findAtomFor(atoms: readonly PositionAtom[], offset: number): PositionAtom | undefined {
    return atoms.find(function (atom) {
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
