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
type SpinnerSlotSnapshot = {
    readonly state: SlotState;
    readonly label: string;
    readonly message: string;
};

const stateToByteMap: Readonly<Record<SlotState, number>> = {
    empty: slotStateEmpty,
    running: slotStateRunning,
    succeeded: slotStateSucceeded,
    failed: slotStateFailed,
    canceled: slotStateCanceled
};

const byteToStateMap: Readonly<Record<number, SlotState>> = {
    [slotStateEmpty]: 'empty',
    [slotStateRunning]: 'running',
    [slotStateSucceeded]: 'succeeded',
    [slotStateFailed]: 'failed',
    [slotStateCanceled]: 'canceled'
};

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
    readonly readSlot: (slotIndex: number) => SpinnerSlotSnapshot;
};

type SpinnerSharedAtomics = {
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
    readonly atomics: SpinnerSharedAtomics;
    readonly now: () => number;
};

function stateToByte(state: SlotState): number {
    return stateToByteMap[state];
}

function byteToState(byte: number): SlotState {
    const state = byteToStateMap[byte];
    if (state === undefined) {
        throw new Error(`Unknown spinner slot state byte ${byte}`);
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
type PendingStableSlotRead = {
    readonly type: 'pending';
    readonly generation: number;
};
type FinishedStableSlotRead = {
    readonly type: 'finished';
    readonly slot: SpinnerSlotSnapshot;
};
type StableSlotRead = FinishedStableSlotRead | PendingStableSlotRead;

type RenderedMutationWaitStep = {
    readonly current: number;
    readonly remainingMs: number;
    readonly timedOutWithoutProgress: boolean;
};
type RenderedMutationWaitStepArgs = {
    readonly atomics: SpinnerSharedAtomics;
    readonly headerInt32: Int32Array;
    readonly now: () => number;
    readonly deadline: number;
    readonly expectedMutation: number;
    readonly timeoutMs: number;
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
    return Object.hasOwn(iteration, 'nextCurrent');
}

function renderedMutationWaitIterationResult(
    iteration: Readonly<Record<string, unknown>> | RenderedMutationWaitIteration
): boolean {
    return Object.hasOwn(iteration, 'result') && Reflect.get(iteration, 'result') === true;
}

function getRenderedMutationWaitAttemptBudget(timeoutMs: number): number {
    return Math.min(maximumRenderedMutationWaitAttempts, Math.max(Math.ceil(timeoutMs), 1));
}

function waitForRenderedMutationStep(args: RenderedMutationWaitStepArgs): RenderedMutationWaitStep {
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

type AdvanceRenderedMutationWaitArgs = {
    readonly atomics: SpinnerSharedAtomics;
    readonly headerInt32: Int32Array;
    readonly now: () => number;
    readonly deadline: number;
    readonly mutation: number;
    readonly current: number;
    readonly remainingMs: number;
    readonly timeoutMs: number;
};

type WaitForRenderedMutationWithinBudgetArgs = {
    readonly atomics: SpinnerSharedAtomics;
    readonly headerInt32: Int32Array;
    readonly mutation: number;
    readonly now: () => number;
    readonly timeoutMs: number;
};
type RenderedMutationWaitState = Float64Array;
type PendingRenderedMutationBudget = {
    readonly type: 'pending';
    readonly state: RenderedMutationWaitState;
};
type FinishedRenderedMutationBudget = {
    readonly type: 'finished';
    readonly result: boolean;
};
type RenderedMutationBudget = FinishedRenderedMutationBudget | PendingRenderedMutationBudget;

function initialRenderedMutationWaitState(
    args: WaitForRenderedMutationWithinBudgetArgs,
    deadline: number
): RenderedMutationWaitState {
    return Float64Array.of(
        args.atomics.load(args.headerInt32, headerRenderedMutationIndex),
        deadline - args.now()
    );
}

function advanceRenderedMutationWait(args: AdvanceRenderedMutationWaitArgs): RenderedMutationWaitIteration {
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
        nextRemainingMs: step.remainingMs
    };
}

function waitForRenderedMutationWithinBudget(args: WaitForRenderedMutationWithinBudgetArgs): boolean {
    const deadline = args.now() + args.timeoutMs;
    const maximumAttempts = getRenderedMutationWaitAttemptBudget(args.timeoutMs);

    const budget = Array.from({ length: maximumAttempts }).reduce<RenderedMutationBudget>(function (currentBudget) {
        if (currentBudget.type !== 'pending') {
            return currentBudget;
        }
        const iteration = advanceRenderedMutationWait({
            atomics: args.atomics,
            headerInt32: args.headerInt32,
            now: args.now,
            deadline,
            mutation: args.mutation,
            current: Number(currentBudget.state[0]),
            remainingMs: Number(currentBudget.state[1]),
            timeoutMs: args.timeoutMs
        });
        if (!isPendingRenderedMutationWaitIteration(iteration)) {
            return { type: 'finished', result: renderedMutationWaitIterationResult(iteration) };
        }
        return { type: 'pending', state: Float64Array.of(iteration.nextCurrent, iteration.nextRemainingMs) };
    }, { type: 'pending', state: initialRenderedMutationWaitState(args, deadline) });

    if (budget.type === 'finished') {
        return budget.result;
    }
    return getRenderedMutationWaitResult(Number(budget.state[0]), Number(budget.state[1]), args.mutation) ?? false;
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
    const slotOffset = function (slotIndex: number): number {
        return layout.headerByteLength + slotIndex * layout.slotByteLength;
    };
    const views: Views = {
        headerInt32,
        headerUint32,
        slotInt32(slotIndex) {
            return new Int32Array(buffer, slotOffset(slotIndex), 1);
        },
        slotBytes(slotIndex) {
            return new Uint8Array(buffer, slotOffset(slotIndex), layout.slotByteLength);
        },
        slotData(slotIndex) {
            return new DataView(buffer, slotOffset(slotIndex), layout.slotByteLength);
        }
    };

    function readSlotSnapshot(slotIndex: number): ReturnType<SpinnerSharedAccessors['readSlot']> {
        return {
            state: byteToState(views.slotData(slotIndex).getUint8(slotStateOffset)),
            label: readStringFromSlot(views, slotIndex, labelSlice),
            message: readStringFromSlot(views, slotIndex, messageSlice)
        };
    }

    function readStableSlotAfterGeneration(slotIndex: number, generationBefore: number): SpinnerSlotSnapshot {
        const read = Array.from({ length: maximumReadSlotAttempts }).reduce<StableSlotRead>(function (currentRead) {
            if (currentRead.type !== 'pending') {
                return currentRead;
            }
            const slot = readSlotSnapshot(slotIndex);
            const nextGeneration = atomics.load(views.slotInt32(slotIndex), slotGenerationIndex);
            if (nextGeneration === currentRead.generation) {
                return { type: 'finished', slot };
            }
            return { type: 'pending', generation: nextGeneration };
        }, { type: 'pending', generation: generationBefore });
        if (read.type === 'finished') {
            return read.slot;
        }
        throw new Error(`Failed to read a stable spinner slot snapshot after ${maximumReadSlotAttempts} attempts`);
    }

    function readStableSlot(slotIndex: number): SpinnerSlotSnapshot {
        return readStableSlotAfterGeneration(
            slotIndex,
            atomics.load(views.slotInt32(slotIndex), slotGenerationIndex)
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
            views.slotData(slotIndex).setUint8(slotStateOffset, stateToByte(state));
            writeStringIntoSlot(views, slotIndex, labelSlice, label);
            writeStringIntoSlot(views, slotIndex, messageSlice, message);
        },
        readSlot: readStableSlot
    };
}
