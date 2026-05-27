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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const slotStates = ['empty', 'running', 'succeeded', 'failed', 'canceled'] as const;
const emptySlotStateIndex = 0;
const runningSlotStateIndex = 1;
const succeededSlotStateIndex = 2;
const failedSlotStateIndex = 3;
const canceledSlotStateIndex = 4;
export const slotState = {
    empty: slotStates[emptySlotStateIndex],
    running: slotStates[runningSlotStateIndex],
    succeeded: slotStates[succeededSlotStateIndex],
    failed: slotStates[failedSlotStateIndex],
    canceled: slotStates[canceledSlotStateIndex]
} as const;

export type SlotState = (typeof slotStates)[number];

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

type RenderedMutationWaitStep = {
    readonly current: number;
    readonly remainingMs: number;
    readonly timedOutWithoutProgress: boolean;
};

type PendingRenderedMutationWaitIteration = {
    readonly nextCurrent: number;
    readonly nextRemainingMs: number;
};

type FinishedRenderedMutationWaitIteration = {
    readonly result: boolean;
};

type RenderedMutationWaitIteration = FinishedRenderedMutationWaitIteration | PendingRenderedMutationWaitIteration;

function isPendingRenderedMutationWaitIteration(
    iteration: Readonly<Record<string, unknown>> | RenderedMutationWaitIteration
): iteration is PendingRenderedMutationWaitIteration {
    return 'nextCurrent' in iteration;
}

function renderedMutationWaitIterationResult(
    iteration: Readonly<Record<string, unknown>> | RenderedMutationWaitIteration
): boolean {
    return 'result' in iteration && iteration.result === true;
}

function getRenderedMutationWaitAttemptBudget(timeoutMs: number): number {
    return Math.min(maximumRenderedMutationWaitAttempts, Math.max(Math.ceil(timeoutMs), 1));
}

function waitForRenderedMutationStep(args: {
    readonly atomics: AtomicsLike;
    readonly headerInt32: Int32Array;
    readonly now: () => number;
    readonly deadline: number;
    readonly expectedMutation: number;
    readonly timeoutMs: number;
}): RenderedMutationWaitStep {
    const waitStatus = args.atomics.wait(
        args.headerInt32,
        headerRenderedMutationIndex,
        args.expectedMutation,
        args.timeoutMs
    );
    const current = args.atomics.load(args.headerInt32, headerRenderedMutationIndex);

    return {
        current,
        remainingMs: args.deadline - args.now(),
        timedOutWithoutProgress: waitStatus === 'timed-out' && current === args.expectedMutation
    };
}

function getRenderedMutationWaitResult(current: number, remainingMs: number, mutation: number): boolean | undefined {
    if (current >= mutation) {
        return true;
    }

    if (remainingMs <= 0) {
        return false;
    }

    return undefined;
}

function getRenderedMutationWaitStepResult(
    current: number,
    remainingMs: number,
    step: RenderedMutationWaitStep,
    mutation: number
): boolean | undefined {
    const waitResult = getRenderedMutationWaitResult(step.current, step.remainingMs, mutation);
    if (waitResult !== undefined) {
        return waitResult;
    }

    if (step.timedOutWithoutProgress) {
        return false;
    }

    if (step.current === current && step.remainingMs > remainingMs) {
        return false;
    }

    return undefined;
}

function advanceRenderedMutationWait(args: {
    readonly atomics: AtomicsLike;
    readonly headerInt32: Int32Array;
    readonly now: () => number;
    readonly deadline: number;
    readonly mutation: number;
    readonly current: number;
    readonly remainingMs: number;
    readonly timeoutMs: number;
}): RenderedMutationWaitIteration {
    const currentResult = getRenderedMutationWaitResult(args.current, args.remainingMs, args.mutation);
    if (currentResult !== undefined) {
        return { result: currentResult };
    }

    const step = waitForRenderedMutationStep({
        atomics: args.atomics,
        headerInt32: args.headerInt32,
        now: args.now,
        deadline: args.deadline,
        expectedMutation: args.current,
        timeoutMs: Math.min(args.remainingMs, args.timeoutMs)
    });
    const stepResult = getRenderedMutationWaitStepResult(args.current, args.remainingMs, step, args.mutation);
    if (stepResult !== undefined) {
        return { result: stepResult };
    }

    return {
        nextCurrent: args.atomics.load(args.headerInt32, headerRenderedMutationIndex),
        nextRemainingMs: args.deadline - args.now()
    };
}

function waitForRenderedMutationWithinBudget(args: {
    readonly atomics: AtomicsLike;
    readonly headerInt32: Int32Array;
    readonly mutation: number;
    readonly now: () => number;
    readonly timeoutMs: number;
}): boolean {
    const deadline = args.now() + args.timeoutMs;
    let current = args.atomics.load(args.headerInt32, headerRenderedMutationIndex);
    let remainingMs = deadline - args.now();

    for (
        let remainingBudget = getRenderedMutationWaitAttemptBudget(args.timeoutMs);
        remainingBudget > 0;
        remainingBudget -= 1
    ) {
        const iteration = advanceRenderedMutationWait({
            atomics: args.atomics,
            headerInt32: args.headerInt32,
            now: args.now,
            deadline,
            mutation: args.mutation,
            current,
            remainingMs,
            timeoutMs: args.timeoutMs
        });
        if (!isPendingRenderedMutationWaitIteration(iteration)) {
            return renderedMutationWaitIterationResult(iteration);
        }
        current = iteration.nextCurrent;
        remainingMs = iteration.nextRemainingMs;
    }

    return getRenderedMutationWaitResult(current, remainingMs, args.mutation) ?? false;
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

export function createSpinnerSharedAccessors(
    buffer: SharedArrayBuffer,
    layout: SpinnerSharedLayout,
    dependencies: Partial<SpinnerSharedDependencies> = {}
): SpinnerSharedAccessors {
    const atomics = dependencies.atomics ?? Atomics;
    const now = dependencies.now ?? Date.now;
    const headerInt32 = new Int32Array(buffer);
    const headerUint32 = new Uint32Array(buffer);
    const slotOffset = (slotIndex: number): number => {
        return layout.headerByteLength + slotIndex * layout.slotByteLength;
    };
    const views: Views = {
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

    function readSlotSnapshot(slotIndex: number): ReturnType<SpinnerSharedAccessors['readSlot']> {
        return {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- writers always use known slot state values
            state: slotStates[views.slotData(slotIndex).getUint8(slotStateOffset)] as SlotState,
            label: readStringFromSlot(views, slotIndex, labelSlice),
            message: readStringFromSlot(views, slotIndex, messageSlice)
        };
    }

    function readStableSlotAfterGeneration(
        slotIndex: number,
        generationBefore: number,
        remainingAttempts: number
    ): ReturnType<SpinnerSharedAccessors['readSlot']> {
        const slot = readSlotSnapshot(slotIndex);
        const generationAfter = atomics.load(views.slotInt32(slotIndex), slotGenerationIndex);
        if (generationAfter === generationBefore) {
            return slot;
        }
        if (remainingAttempts > 1) {
            return readStableSlotAfterGeneration(slotIndex, generationAfter, remainingAttempts - 1);
        }

        throw new Error('Failed to read a stable spinner slot snapshot');
    }

    function readStableSlot(slotIndex: number): ReturnType<SpinnerSharedAccessors['readSlot']> {
        return readStableSlotAfterGeneration(
            slotIndex,
            atomics.load(views.slotInt32(slotIndex), slotGenerationIndex),
            maximumReadSlotAttempts
        );
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
            return waitForRenderedMutationWithinBudget({
                atomics,
                headerInt32: views.headerInt32,
                mutation,
                now,
                timeoutMs
            });
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
            views.slotData(slotIndex).setUint8(slotStateOffset, slotStates.indexOf(state));
            writeStringIntoSlot(views, slotIndex, labelSlice, label);
            writeStringIntoSlot(views, slotIndex, messageSlice, message);
        },
        readSlot: readStableSlot
    };
}
