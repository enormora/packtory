import { clearEntireLine, cursorToColumnZero, cursorUp, formatLine } from './spinner-glyphs.ts';
import { findHighestActiveSlotIndex, readAllSnapshots, type SlotSnapshot } from './spinner-snapshots.ts';
import type { SpinnerSharedAccessors } from './spinner-shared-state.ts';

export type RenderState = {
    snapshots: readonly SlotSnapshot[];
    renderedLineCount: number;
    frameIndex: number;
};

export type RenderTickOutput = {
    readonly expectedLineCount: number;
    readonly snapshots: readonly SlotSnapshot[];
    readonly sequence: string | undefined;
    readonly targetMutation: number;
};

function buildRedrawSequence(state: RenderState, columns: number, expectedLineCount: number): string {
    let output = '';
    if (state.renderedLineCount > 0) {
        output += cursorUp(state.renderedLineCount);
    }

    const visibleSnapshots = state.snapshots.slice(0, expectedLineCount);
    for (const snapshot of visibleSnapshots) {
        const line = formatLine(snapshot, state.frameIndex, columns);
        output += `${clearEntireLine + cursorToColumnZero + line}\n`;
    }

    return output;
}

export function buildRenderTickOutput(accessors: SpinnerSharedAccessors, state: RenderState): RenderTickOutput {
    const targetMutation = accessors.getLatestMutation();
    const snapshots = readAllSnapshots(accessors);
    const highestActive = findHighestActiveSlotIndex(snapshots);
    const shouldSkipWrite = highestActive < 0 && state.renderedLineCount === 0;
    if (shouldSkipWrite) {
        return { expectedLineCount: 0, snapshots, sequence: undefined, targetMutation };
    }

    const expectedLineCount = Math.max(state.renderedLineCount, highestActive + 1);
    return {
        expectedLineCount,
        snapshots,
        sequence: buildRedrawSequence({ ...state, snapshots }, accessors.getColumns(), expectedLineCount),
        targetMutation
    };
}
