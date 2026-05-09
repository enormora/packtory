const headerByteLength = 16;
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
const slotGenerationIndex = 0;

const controlShutdownValue = 1;
const controlIdleValue = 0;

const slotStateEmpty = 0;
const slotStateRunning = 1;
const slotStateSucceeded = 2;
const slotStateFailed = 3;
const slotStateCanceled = 4;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type SlotState = 'canceled' | 'empty' | 'failed' | 'running' | 'succeeded';

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

function stateToByte(state: SlotState): number {
    return stateToByteMap[state];
}

function byteToState(byte: number): SlotState {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- writers always go through stateToByteMap so the byte is one of the known state values
    return byteToStateMap[byte] as SlotState;
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
    layout: SpinnerSharedLayout
): SpinnerSharedAccessors {
    const views = createViews(buffer, layout);

    function writeStateByte(slotIndex: number, stateByte: number): void {
        views.slotData(slotIndex).setUint8(slotStateOffset, stateByte);
    }

    function readSlotGeneration(slotIndex: number): number {
        return Atomics.load(views.slotInt32(slotIndex), slotGenerationIndex);
    }

    return {
        layout,
        buffer,
        setColumns(columns) {
            Atomics.store(views.headerUint32, headerColumnsIndex, columns);
        },
        getColumns() {
            return Atomics.load(views.headerUint32, headerColumnsIndex);
        },
        setIntervalMs(intervalMs) {
            Atomics.store(views.headerUint32, headerIntervalIndex, intervalMs);
        },
        getIntervalMs() {
            return Atomics.load(views.headerUint32, headerIntervalIndex);
        },
        requestShutdown() {
            Atomics.store(views.headerInt32, headerControlIndex, controlShutdownValue);
        },
        isShutdownRequested() {
            return Atomics.load(views.headerInt32, headerControlIndex) !== controlIdleValue;
        },
        bumpSlotGeneration(slotIndex) {
            Atomics.add(views.slotInt32(slotIndex), slotGenerationIndex, 1);
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
            let slot = readSlotContent(views, slotIndex);
            let generationAfter = readSlotGeneration(slotIndex);
            while (generationAfter !== generationBefore) {
                generationBefore = generationAfter;
                slot = readSlotContent(views, slotIndex);
                generationAfter = readSlotGeneration(slotIndex);
            }
            return slot;
        }
    };
}
