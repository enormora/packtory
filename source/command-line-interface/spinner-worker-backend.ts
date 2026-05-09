import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SlotState,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';
import type { SpinnerBackend } from './terminal-spinner-renderer.ts';

const defaultSlotCount = 64;
const defaultIntervalMs = 80;
const defaultColumns = 80;

export type WorkerSpawnRequest = {
    readonly buffer: SharedArrayBuffer;
    readonly slotCount: number;
    readonly stdoutFileDescriptor: number;
};

type WorkerSpawner = (request: WorkerSpawnRequest) => void;

export type SpinnerRuntimeOptions = {
    readonly slotCount?: number;
    readonly intervalMs?: number;
    readonly stdoutFileDescriptor?: number;
    readonly stdoutColumns?: number;
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
        stdoutFileDescriptor: options.stdoutFileDescriptor ?? process.stdout.fd,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- process.stdout.columns is undefined at runtime when stdout is not a TTY, despite the type declaring it as number
        stdoutColumns: options.stdoutColumns ?? process.stdout.columns ?? defaultColumns,
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

type SlotUpdate = {
    readonly slotIndex: number;
    readonly state: SlotState;
    readonly label: string;
    readonly message: string;
};

function writeSlot(accessors: SpinnerSharedAccessors, update: SlotUpdate): void {
    accessors.writeSlot(update.slotIndex, update.state, update.label, update.message);
    accessors.bumpSlotGeneration(update.slotIndex);
}

export type WorkerSpinnerBackendDependencies = {
    readonly runtime: SpinnerRuntime;
};

export function createWorkerSpinnerBackend(dependencies: WorkerSpinnerBackendDependencies): SpinnerBackend {
    const { runtime } = dependencies;

    function ensureSlotIndexFits(slotIndex: number): void {
        if (slotIndex >= runtime.slotCount) {
            throw new RangeError(
                `Spinner slot index ${slotIndex} exceeds backend capacity ${runtime.slotCount}; increase slotCount`
            );
        }
    }

    return {
        add(slotIndex, label, message) {
            ensureSlotIndexFits(slotIndex);
            writeSlot(runtime.accessors, { slotIndex, state: 'running', label, message });
        },
        update(slotIndex, label, message) {
            ensureSlotIndexFits(slotIndex);
            writeSlot(runtime.accessors, { slotIndex, state: 'running', label, message });
        },
        finish(slotIndex, status, label, message) {
            ensureSlotIndexFits(slotIndex);
            writeSlot(runtime.accessors, { slotIndex, state: status, label, message });
        },
        shutdown() {
            runtime.accessors.requestShutdown();
        }
    };
}
