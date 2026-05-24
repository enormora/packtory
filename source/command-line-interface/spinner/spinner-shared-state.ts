const headerByteLength = 24;
const slotByteLength = 384;
const labelByteLength = 64;
const messageByteLength = 256;

const slotStateOffset = 4;
const slotLabelLengthOffset = 8;
const slotMessageLengthOffset = 10;
const slotLabelOffset = 16;
const slotMessageOffset = slotLabelOffset + labelByteLength;

const headerControlIndex = 0;
const headerColumnsIndex = 1;
const headerIntervalIndex = 2;
const headerMutationIndex = 3;
const headerRenderedMutationIndex = 4;
const slotGenerationIndex = 0;

const controlShutdownValue = 1;
const controlIdleValue = 0;
const maximumReadSlotAttempts = 1024;
const maximumRenderedMutationWaitAttempts = 256;

const slotStateEmpty = 0;
const slotStateRunning = 1;
const slotStateSucceeded = 2;
const slotStateFailed = 3;
const slotStateCanceled = 4;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type SlotState = 'canceled' | 'empty' | 'failed' | 'running' | 'succeeded';

const slotStates: readonly SlotState[] = ['empty', 'running', 'succeeded', 'failed', 'canceled'];

const stateToByteMap: Readonly<Record<SlotState, number>> = {
    empty: slotStateEmpty,
    running: slotStateRunning,
    succeeded: slotStateSucceeded,
    failed: slotStateFailed,
    canceled: slotStateCanceled
};

function createByteToStateMap(
    slotStateBytes: Readonly<Record<SlotState, number>>
): Readonly<Partial<Record<number, SlotState>>> {
    const byteToStateMap: Partial<Record<number, SlotState>> = {};
    for (const state of slotStates) {
        byteToStateMap[slotStateBytes[state]] = state;
    }
    return byteToStateMap;
}

const byteToStateMap = createByteToStateMap(stateToByteMap);

export type SpinnerSharedLayout = {
    readonly bufferByteLength: number;
    readonly slotCount: number;
    readonly slotByteLength: number;
    readonly headerByteLength: number;
};

export function createSpinnerSharedLayout(slotCount: number): SpinnerSharedLayout {
    return {
        bufferByteLength: headerByteLength + slotCount * slotByteLength,
        slotCount,
        slotByteLength,
        headerByteLength
    };
}

export type SpinnerSharedAccessors = {
    readonly layout: SpinnerSharedLayout;
    readonly buffer: SharedArrayBuffer;
    readonly setColumns: (columns: number) => void;
    readonly getColumns: () => number;
    readonly setIntervalMs: (intervalMs: number) => void;
    readonly getIntervalMs: () => number;
    readonly markMutation: () => number;
    readonly getLatestMutation: () => number;
    readonly acknowledgeRender: (mutation: number) => void;
    readonly waitForRenderedMutation: (mutation: number, timeoutMs: number) => boolean;
    readonly requestShutdown: () => void;
    readonly isShutdownRequested: () => boolean;
    readonly bumpSlotGeneration: (slotIndex: number) => void;
    readonly writeSlot: (slotIndex: number, state: SlotState, label: string, message: string) => void;
    readonly readSlot: (slotIndex: number) => {
        readonly state: SlotState;
        readonly label: string;
        readonly message: string;
    };
};

type AtomicsLike = {
    readonly add: (typedArray: Int32Array | Uint32Array, index: number, value: number) => number;
    readonly load: (typedArray: Int32Array | Uint32Array, index: number) => number;
    readonly notify: (typedArray: Int32Array, index: number, count?: number) => number;
    readonly store: (typedArray: Int32Array | Uint32Array, index: number, value: number) => number;
    readonly wait: (
        typedArray: Int32Array,
        index: number,
        value: number,
        timeout?: number
    ) => 'not-equal' | 'ok' | 'timed-out';
};

type SpinnerSharedDependencies = {
    readonly atomics: AtomicsLike;
    readonly now: () => number;
};

function getCurrentTimeInMilliseconds(): number {
    return Date.now();
}

function stateToByte(state: SlotState): number {
    return stateToByteMap[state];
}

function byteToState(byte: number): SlotState {
    const state = byteToStateMap[byte];
    if (state === undefined) {
        throw new Error(`Unknown slot state byte "${byte}"`);
    }
    return state;
}

type SlotStringSlice = {
    readonly contentOffset: number;
    readonly contentCapacity: number;
    readonly lengthOffset: number;
};

const labelSlice: SlotStringSlice = {
    contentOffset: slotLabelOffset,
    contentCapacity: labelByteLength,
    lengthOffset: slotLabelLengthOffset
};

const messageSlice: SlotStringSlice = {
    contentOffset: slotMessageOffset,
    contentCapacity: messageByteLength,
    lengthOffset: slotMessageLengthOffset
};

type Views = {
    readonly headerInt32: Int32Array;
    readonly headerUint32: Uint32Array;
    readonly slotInt32: (slotIndex: number) => Int32Array;
    readonly slotBytes: (slotIndex: number) => Uint8Array;
    readonly slotData: (slotIndex: number) => DataView;
};

function waitForRenderedMutationStep(args: {
    readonly atomics: AtomicsLike;
    readonly headerInt32: Int32Array;
    readonly expectedMutation: number;
    readonly timeoutMs: number;
    readonly readRemainingMs: () => number;
}): {
    readonly current: number;
    readonly remainingMs: number;
    readonly timedOutWithoutProgress: boolean;
} {
    const waitResult = args.atomics.wait(
        args.headerInt32,
        headerRenderedMutationIndex,
        args.expectedMutation,
        args.timeoutMs
    );
    const current = args.atomics.load(args.headerInt32, headerRenderedMutationIndex);

    return {
        current,
        remainingMs: args.readRemainingMs(),
        timedOutWithoutProgress: waitResult === 'timed-out' && current === args.expectedMutation
    };
}

function readRenderedMutationState(
    atomics: AtomicsLike,
    headerInt32: Int32Array,
    readRemainingMs: () => number
): {
    readonly current: number;
    readonly remainingMs: number;
} {
    return {
        current: atomics.load(headerInt32, headerRenderedMutationIndex),
        remainingMs: readRemainingMs()
    };
}

function shouldContinueWaitingForRenderedMutation(
    state: ReturnType<typeof readRenderedMutationState>,
    mutation: number
): boolean {
    return state.current < mutation && state.remainingMs > 0;
}

function shouldAbortWaitingForRenderedMutation(
    state: ReturnType<typeof readRenderedMutationState>,
    step: ReturnType<typeof waitForRenderedMutationStep>,
    mutation: number
): boolean {
    return (
        (step.current === state.current && step.remainingMs > state.remainingMs) ||
        step.current >= mutation ||
        step.timedOutWithoutProgress
    );
}

function createViews(buffer: SharedArrayBuffer, layout: SpinnerSharedLayout): Views {
    const headerInt32 = new Int32Array(buffer);
    const headerUint32 = new Uint32Array(buffer);
    const slotOffset = (slotIndex: number): number => {
        return layout.headerByteLength + slotIndex * layout.slotByteLength;
    };
    return {
        headerInt32,
        headerUint32,
        slotInt32: (slotIndex) => {
            return new Int32Array(buffer, slotOffset(slotIndex), 1);
        },
        slotBytes: (slotIndex) => {
            return new Uint8Array(buffer, slotOffset(slotIndex), layout.slotByteLength);
        },
        slotData: (slotIndex) => {
            return new DataView(buffer, slotOffset(slotIndex), layout.slotByteLength);
        }
    };
}

function writeStringIntoSlot(views: Views, slotIndex: number, slice: SlotStringSlice, value: string): void {
    const target = views
        .slotBytes(slotIndex)
        .subarray(slice.contentOffset, slice.contentOffset + slice.contentCapacity);
    target.fill(0);
    const { written } = textEncoder.encodeInto(value, target);
    views.slotData(slotIndex).setUint16(slice.lengthOffset, written, true);
}

function readStringFromSlot(views: Views, slotIndex: number, slice: SlotStringSlice): string {
    const length = views.slotData(slotIndex).getUint16(slice.lengthOffset, true);
    return textDecoder.decode(views.slotBytes(slotIndex).subarray(slice.contentOffset, slice.contentOffset + length));
}

function readSlotContent(
    views: Views,
    slotIndex: number
): { readonly state: SlotState; readonly label: string; readonly message: string } {
    return {
        state: byteToState(views.slotData(slotIndex).getUint8(slotStateOffset)),
        label: readStringFromSlot(views, slotIndex, labelSlice),
        message: readStringFromSlot(views, slotIndex, messageSlice)
    };
}

export function createSpinnerSharedAccessors(
    buffer: SharedArrayBuffer,
    layout: SpinnerSharedLayout,
    dependencies: Partial<SpinnerSharedDependencies> = {}
): SpinnerSharedAccessors {
    const atomics = dependencies.atomics ?? Atomics;
    const now = dependencies.now ?? getCurrentTimeInMilliseconds;
    const views = createViews(buffer, layout);

    function writeStateByte(slotIndex: number, stateByte: number): void {
        views.slotData(slotIndex).setUint8(slotStateOffset, stateByte);
    }

    function readSlotGeneration(slotIndex: number): number {
        return atomics.load(views.slotInt32(slotIndex), slotGenerationIndex);
    }

    function readSlotAttempt(slotIndex: number): {
        readonly slot: ReturnType<SpinnerSharedAccessors['readSlot']>;
        readonly generationAfter: number;
    } {
        return {
            slot: readSlotContent(views, slotIndex),
            generationAfter: readSlotGeneration(slotIndex)
        };
    }

    return {
        layout,
        buffer,
        setColumns(columns) {
            atomics.store(views.headerUint32, headerColumnsIndex, columns);
        },
        getColumns() {
            return atomics.load(views.headerUint32, headerColumnsIndex);
        },
        setIntervalMs(intervalMs) {
            atomics.store(views.headerUint32, headerIntervalIndex, intervalMs);
        },
        getIntervalMs() {
            return atomics.load(views.headerUint32, headerIntervalIndex);
        },
        markMutation() {
            return atomics.add(views.headerInt32, headerMutationIndex, 1) + 1;
        },
        getLatestMutation() {
            return atomics.load(views.headerInt32, headerMutationIndex);
        },
        acknowledgeRender(mutation) {
            atomics.store(views.headerInt32, headerRenderedMutationIndex, mutation);
            atomics.notify(views.headerInt32, headerRenderedMutationIndex);
        },
        waitForRenderedMutation(mutation, timeoutMs) {
            const deadline = now() + timeoutMs;
            const readRemainingMs = (): number => {
                return deadline - now();
            };
            let state = readRenderedMutationState(atomics, views.headerInt32, readRemainingMs);
            let remainingAttempts = Math.min(maximumRenderedMutationWaitAttempts, Math.max(Math.ceil(timeoutMs), 1));

            for (
                ;
                shouldContinueWaitingForRenderedMutation(state, mutation) && remainingAttempts > 0;
                state = readRenderedMutationState(atomics, views.headerInt32, readRemainingMs), remainingAttempts -= 1
            ) {
                const waitTimeoutMs = Math.min(state.remainingMs, timeoutMs);
                const step = waitForRenderedMutationStep({
                    atomics,
                    headerInt32: views.headerInt32,
                    expectedMutation: state.current,
                    timeoutMs: waitTimeoutMs,
                    readRemainingMs
                });
                if (shouldAbortWaitingForRenderedMutation(state, step, mutation)) {
                    return step.current >= mutation;
                }
            }

            return state.current >= mutation;
        },
        requestShutdown() {
            atomics.store(views.headerInt32, headerControlIndex, controlShutdownValue);
        },
        isShutdownRequested() {
            return atomics.load(views.headerInt32, headerControlIndex) !== controlIdleValue;
        },
        bumpSlotGeneration(slotIndex) {
            atomics.add(views.slotInt32(slotIndex), slotGenerationIndex, 1);
        },
        writeSlot(slotIndex, state, label, message) {
            writeStateByte(slotIndex, stateToByte(state));
            writeStringIntoSlot(views, slotIndex, labelSlice, label);
            writeStringIntoSlot(views, slotIndex, messageSlice, message);
        },
        readSlot(slotIndex) {
            // Seqlock retry: writers atomically bump the slot generation after
            // updating the (non-atomic) label/message bytes; if the generation
            // moves between the two reads we observed a torn write and retry.
            let generationBefore = readSlotGeneration(slotIndex);
            for (let remainingAttempts = maximumReadSlotAttempts; remainingAttempts > 0; remainingAttempts -= 1) {
                const attemptResult = readSlotAttempt(slotIndex);
                if (attemptResult.generationAfter === generationBefore) {
                    return attemptResult.slot;
                }
                generationBefore = attemptResult.generationAfter;
            }
            throw new Error('Failed to read a stable spinner slot snapshot');
        }
    };
}
