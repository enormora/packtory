import { bold, green, red } from 'yoctocolors';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SlotState,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

const spinnerFrames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const successSymbol = bold(green('✔'));
const failureSymbol = bold(red('✖'));

const cursorUp = (lines: number): string => {
    return `[${lines}A`;
};
const clearEntireLine = '[2K';
const cursorToColumnZero = '\r';

type SlotSnapshot = {
    readonly generation: number;
    readonly state: SlotState;
    readonly label: string;
    readonly message: string;
};

type RenderState = {
    snapshots: readonly SlotSnapshot[];
    renderedLineCount: number;
    frameIndex: number;
};

export type SpinnerWorkerInput = {
    readonly buffer: SharedArrayBuffer;
    readonly slotCount: number;
    readonly stdoutFileDescriptor: number;
};

export type SpinnerWorkerDependencies<Handle = unknown> = {
    readonly write: (fileDescriptor: number, chunk: string) => void;
    readonly setInterval: (callback: () => void, ms: number) => Handle;
    readonly clearInterval: (handle: Handle) => void;
};

function readSlotSnapshot(accessors: SpinnerSharedAccessors, slotIndex: number): SlotSnapshot {
    const generation = accessors.readSlotGeneration(slotIndex);
    const slot = accessors.readSlot(slotIndex);
    return { generation, state: slot.state, label: slot.label, message: slot.message };
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

function formatLine(snapshot: SlotSnapshot, frameIndex: number, columns: number): string {
    const glyph = selectGlyph(snapshot.state, frameIndex);
    const composed = `${glyph} ${snapshot.label}: ${snapshot.message}`;
    return truncateToColumns(composed, columns);
}

function readAllSnapshots(accessors: SpinnerSharedAccessors): SlotSnapshot[] {
    const snapshots: SlotSnapshot[] = [];
    for (let slotIndex = 0; slotIndex < accessors.layout.slotCount; slotIndex += 1) {
        snapshots.push(readSlotSnapshot(accessors, slotIndex));
    }
    return snapshots;
}

function findHighestActiveSlotIndex(snapshots: readonly SlotSnapshot[]): number {
    return snapshots.findLastIndex((snapshot) => {
        return snapshot.state !== 'empty';
    });
}

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

export function startSpinnerWorker<Handle>(
    input: SpinnerWorkerInput,
    dependencies: SpinnerWorkerDependencies<Handle>
): void {
    const layout = createSpinnerSharedLayout(input.slotCount);
    const accessors = createSpinnerSharedAccessors(input.buffer, layout);
    const state: RenderState = {
        snapshots: readAllSnapshots(accessors),
        renderedLineCount: 0,
        frameIndex: 0
    };

    function renderTick(): void {
        const snapshots = readAllSnapshots(accessors);
        const highestActive = findHighestActiveSlotIndex(snapshots);
        if (highestActive < 0 && state.renderedLineCount === 0) {
            return;
        }
        const expectedLineCount = Math.max(state.renderedLineCount, highestActive + 1);
        state.snapshots = snapshots;
        const sequence = buildRedrawSequence(state, accessors.getColumns(), expectedLineCount);
        dependencies.write(input.stdoutFileDescriptor, sequence);
        state.renderedLineCount = expectedLineCount;
        state.frameIndex += 1;
    }

    const intervalMs = accessors.getIntervalMs();
    const ticker = dependencies.setInterval(() => {
        renderTick();
        if (accessors.isShutdownRequested()) {
            renderTick();
            dependencies.clearInterval(ticker);
        }
    }, intervalMs);
}

export function isSpinnerWorkerInput(value: unknown): value is SpinnerWorkerInput {
    return (
        typeof value === 'object' &&
        value !== null &&
        Reflect.get(value, 'buffer') instanceof SharedArrayBuffer &&
        typeof Reflect.get(value, 'slotCount') === 'number' &&
        typeof Reflect.get(value, 'stdoutFileDescriptor') === 'number'
    );
}
