import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

const defaultSlotCount = 64;
const defaultIntervalMilliseconds = 80;

export type WorkerSpawnRequest = {
    readonly buffer: SharedArrayBuffer;
    readonly slotCount: number;
    readonly standardOutputFileDescriptor: number;
};

type WorkerSpawner = (request: WorkerSpawnRequest) => void;

export type SpinnerRuntimeOptions = {
    readonly slotCount?: number;
    readonly intervalMilliseconds?: number;
    readonly standardOutputFileDescriptor: number;
    readonly standardOutputColumns: number;
    readonly spawnWorker: WorkerSpawner;
};

export type SpinnerRuntime = {
    readonly accessors: SpinnerSharedAccessors;
    readonly slotCount: number;
};

type ResolvedOptions = {
    readonly slotCount: number;
    readonly intervalMilliseconds: number;
    readonly standardOutputFileDescriptor: number;
    readonly standardOutputColumns: number;
    readonly spawnWorker: WorkerSpawner;
};

function resolveOptions(options: SpinnerRuntimeOptions): ResolvedOptions {
    return {
        slotCount: options.slotCount ?? defaultSlotCount,
        intervalMilliseconds: options.intervalMilliseconds ?? defaultIntervalMilliseconds,
        standardOutputFileDescriptor: options.standardOutputFileDescriptor,
        standardOutputColumns: options.standardOutputColumns,
        spawnWorker: options.spawnWorker
    };
}

function setupSharedBuffer(resolved: ResolvedOptions): SpinnerSharedAccessors {
    const layout = createSpinnerSharedLayout(resolved.slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    const accessors = createSpinnerSharedAccessors(buffer, layout);
    accessors.setIntervalMilliseconds(resolved.intervalMilliseconds);
    accessors.setColumns(resolved.standardOutputColumns);
    return accessors;
}

export function createSpinnerRuntime(options: SpinnerRuntimeOptions): SpinnerRuntime {
    const resolved = resolveOptions(options);
    const accessors = setupSharedBuffer(resolved);
    resolved.spawnWorker({
        buffer: accessors.buffer,
        slotCount: accessors.layout.slotCount,
        standardOutputFileDescriptor: resolved.standardOutputFileDescriptor
    });
    return { accessors, slotCount: resolved.slotCount };
}
