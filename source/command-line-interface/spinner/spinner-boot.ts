import { createSpinnerRuntime, type SpinnerRuntime, type SpinnerRuntimeOptions } from './spinner-runtime.ts';
import { slotState } from './spinner-shared-state.ts';

const bootSlotIndex = 0;

export type SpinnerBootOptions = SpinnerRuntimeOptions & {
    readonly initialLabel: string;
    readonly initialMessage: string;
};

export function bootSpinnerRuntime(options: SpinnerBootOptions): SpinnerRuntime {
    const runtime = createSpinnerRuntime(options);
    runtime.accessors.writeSlot(bootSlotIndex, slotState.running, options.initialLabel, options.initialMessage);
    runtime.accessors.bumpSlotGeneration(bootSlotIndex);
    runtime.accessors.markMutation();
    return runtime;
}
