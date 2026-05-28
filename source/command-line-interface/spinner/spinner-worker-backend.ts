import type { SlotState, SpinnerSharedAccessors } from './spinner-shared-state.ts';
import type { SpinnerRuntime } from './spinner-runtime.ts';
import type { SpinnerBackend } from './terminal-spinner-renderer.ts';

const shutdownFlushIntervals = 4;
const minimumShutdownFlushTimeoutMs = 100;

type SlotUpdate = {
    readonly slotIndex: number;
    readonly state: SlotState;
    readonly label: string;
    readonly message: string;
};

function writeSlot(accessors: SpinnerSharedAccessors, update: SlotUpdate): void {
    accessors.writeSlot(update.slotIndex, update.state, update.label, update.message);
    accessors.bumpSlotGeneration(update.slotIndex);
    accessors.markMutation();
}

export type WorkerSpinnerBackendDependencies = {
    readonly runtime: SpinnerRuntime;
};

export function createWorkerSpinnerBackend(dependencies: WorkerSpinnerBackendDependencies): SpinnerBackend {
    const { runtime } = dependencies;
    const shutdownFlushTimeoutMs = Math.max(
        runtime.accessors.getIntervalMs() * shutdownFlushIntervals,
        minimumShutdownFlushTimeoutMs
    );
    let shutdownSignaled = false;

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
            if (shutdownSignaled) {
                return;
            }
            shutdownSignaled = true;
            runtime.accessors.requestShutdown();
            const shutdownMutation = runtime.accessors.markMutation();
            if (runtime.accessors.getIntervalMs() > 0) {
                runtime.accessors.waitForRenderedMutation(shutdownMutation, shutdownFlushTimeoutMs);
            }
        }
    };
}
