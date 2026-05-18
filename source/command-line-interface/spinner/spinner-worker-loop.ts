import { buildRenderTickOutput, type RenderState } from './spinner-render-sequence.ts';
import { createSpinnerSharedAccessors, createSpinnerSharedLayout } from './spinner-shared-state.ts';
import { readAllSnapshots } from './spinner-snapshots.ts';

export type SpinnerWorkerInput = {
    readonly buffer: SharedArrayBuffer;
    readonly slotCount: number;
    readonly stdoutFileDescriptor: number;
};

export type SpinnerWorkerDependencies<Handle = unknown> = {
    readonly write: (fileDescriptor: number, chunk: string) => void;
    readonly setInterval: (callback: () => void, ms: number) => Handle;
    readonly clearInterval: (handle: Handle) => void;
};

export function startSpinnerWorker<Handle>(
    input: SpinnerWorkerInput,
    dependencies: SpinnerWorkerDependencies<Handle>
): void {
    const layout = createSpinnerSharedLayout(input.slotCount);
    const accessors = createSpinnerSharedAccessors(input.buffer, layout);
    const state: RenderState = {
        snapshots: readAllSnapshots(accessors),
        renderedLineCount: 0,
        frameIndex: 0
    };

    function renderTick(): void {
        const output = buildRenderTickOutput(accessors, state);
        state.snapshots = output.snapshots;
        if (output.sequence !== undefined) {
            dependencies.write(input.stdoutFileDescriptor, output.sequence);
            state.renderedLineCount = output.expectedLineCount;
            state.frameIndex += 1;
        }
        accessors.acknowledgeRender(output.targetMutation);
    }

    const intervalMs = accessors.getIntervalMs();
    const ticker = dependencies.setInterval(() => {
        renderTick();
        if (accessors.isShutdownRequested()) {
            renderTick();
            dependencies.clearInterval(ticker);
        }
    }, intervalMs);
}

export function isSpinnerWorkerInput(value: unknown): value is SpinnerWorkerInput {
    return (
        typeof value === 'object' &&
        value !== null &&
        Reflect.get(value, 'buffer') instanceof SharedArrayBuffer &&
        typeof Reflect.get(value, 'slotCount') === 'number' &&
        typeof Reflect.get(value, 'stdoutFileDescriptor') === 'number'
    );
}
