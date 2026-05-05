import { createSpinnerRuntime, type SpinnerRuntime, type SpinnerRuntimeOptions } from './spinner-worker-backend.ts';

const bootSlotIndex = 0;

export type SpinnerBootOptions = SpinnerRuntimeOptions & {
    readonly initialLabel: string;
    readonly initialMessage: string;
};

export function bootSpinnerRuntime(options: SpinnerBootOptions): SpinnerRuntime {
    const runtime = createSpinnerRuntime(options);
    runtime.accessors.writeSlot(bootSlotIndex, 'running', options.initialLabel, options.initialMessage);
    runtime.accessors.bumpSlotGeneration(bootSlotIndex);
    return runtime;
}
