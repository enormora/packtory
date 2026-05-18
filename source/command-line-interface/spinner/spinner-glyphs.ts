import { bold, green, red } from 'yoctocolors';
import type { SlotState } from './spinner-shared-state.ts';

const spinnerFrames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const successSymbol = bold(green('✔'));
const failureSymbol = bold(red('✖'));

const escapeSequence = '';
export const cursorToColumnZero = '\r';
export const clearEntireLine = `${escapeSequence}[2K`;

export function cursorUp(lines: number): string {
    return `${escapeSequence}[${lines}A`;
}

function selectGlyph(state: SlotState, frameIndex: number): string {
    if (state === 'succeeded') {
        return successSymbol;
    }
    if (state === 'failed' || state === 'canceled') {
        return failureSymbol;
    }
    return spinnerFrames.charAt(frameIndex % spinnerFrames.length);
}

function truncateToColumns(line: string, columns: number): string {
    if (columns <= 0) {
        return line;
    }
    return line.slice(0, columns);
}

export function formatLine(
    snapshot: { readonly state: SlotState; readonly label: string; readonly message: string },
    frameIndex: number,
    columns: number
): string {
    const glyph = selectGlyph(snapshot.state, frameIndex);
    const composed = `${glyph} ${snapshot.label}: ${snapshot.message}`;
    return truncateToColumns(composed, columns);
}
