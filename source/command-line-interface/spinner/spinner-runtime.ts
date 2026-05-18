import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

const defaultSlotCount = 64;
const defaultIntervalMs = 80;

export type WorkerSpawnRequest = {
    readonly buffer: SharedArrayBuffer;
    readonly slotCount: number;
    readonly stdoutFileDescriptor: number;
};

type WorkerSpawner = (request: WorkerSpawnRequest) => void;

export type SpinnerRuntimeOptions = {
    readonly slotCount?: number;
    readonly intervalMs?: number;
    readonly stdoutFileDescriptor: number;
    readonly stdoutColumns: number;
    readonly spawnWorker: WorkerSpawner;
};

export type SpinnerRuntime = {
    readonly accessors: SpinnerSharedAccessors;
    readonly slotCount: number;
};

type ResolvedOptions = {
    readonly slotCount: number;
    readonly intervalMs: number;
    readonly stdoutFileDescriptor: number;
    readonly stdoutColumns: number;
    readonly spawnWorker: WorkerSpawner;
};

function resolveOptions(options: SpinnerRuntimeOptions): ResolvedOptions {
    return {
        slotCount: options.slotCount ?? defaultSlotCount,
        intervalMs: options.intervalMs ?? defaultIntervalMs,
        stdoutFileDescriptor: options.stdoutFileDescriptor,
        stdoutColumns: options.stdoutColumns,
        spawnWorker: options.spawnWorker
    };
}

function setupSharedBuffer(resolved: ResolvedOptions): SpinnerSharedAccessors {
    const layout = createSpinnerSharedLayout(resolved.slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    const accessors = createSpinnerSharedAccessors(buffer, layout);
    accessors.setIntervalMs(resolved.intervalMs);
    accessors.setColumns(resolved.stdoutColumns);
    return accessors;
}

export function createSpinnerRuntime(options: SpinnerRuntimeOptions): SpinnerRuntime {
    const resolved = resolveOptions(options);
    const accessors = setupSharedBuffer(resolved);
    resolved.spawnWorker({
        buffer: accessors.buffer,
        slotCount: accessors.layout.slotCount,
        stdoutFileDescriptor: resolved.stdoutFileDescriptor
    });
    return { accessors, slotCount: resolved.slotCount };
}
