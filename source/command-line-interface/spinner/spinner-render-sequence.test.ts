import assert from 'node:assert';
import { test } from 'mocha';
import { buildRenderTickOutput } from './spinner-render-sequence.ts';
import { createSpinnerSharedAccessors, createSpinnerSharedLayout } from './spinner-shared-state.ts';

function createAccessors(slotCount: number) {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    return createSpinnerSharedAccessors(buffer, layout);
}

test('buildRenderTickOutput returns no sequence when no slot is active and nothing was rendered before', () => {
    const accessors = createAccessors(3);
    const output = buildRenderTickOutput(accessors, { snapshots: [], renderedLineCount: 0, frameIndex: 0 });

    assert.strictEqual(output.sequence, undefined);
    assert.strictEqual(output.expectedLineCount, 0);
});

test('buildRenderTickOutput renders one line per active slot and ends each line with a newline', () => {
    const accessors = createAccessors(3);
    accessors.writeSlot(0, 'running', 'pkg-a', 'go');
    accessors.writeSlot(1, 'running', 'pkg-b', 'building');

    const output = buildRenderTickOutput(accessors, { snapshots: [], renderedLineCount: 0, frameIndex: 0 });

    assert.strictEqual(output.expectedLineCount, 2);
    assert.ok(output.sequence?.endsWith('\n'));
    const lineCount = output.sequence?.split('\n').length;
    assert.strictEqual(lineCount, 3);
});

test('buildRenderTickOutput prepends a cursor-up sequence equal to the previously rendered line count', () => {
    const accessors = createAccessors(2);
    accessors.writeSlot(0, 'running', 'pkg-a', 'go');

    const output = buildRenderTickOutput(accessors, { snapshots: [], renderedLineCount: 2, frameIndex: 0 });

    assert.ok(output.sequence?.includes('[2A'));
});

test('buildRenderTickOutput surfaces the latest mutation counter from the shared accessors', () => {
    const accessors = createAccessors(1);
    accessors.writeSlot(0, 'running', 'pkg-a', 'go');
    const output = buildRenderTickOutput(accessors, { snapshots: [], renderedLineCount: 0, frameIndex: 0 });

    assert.strictEqual(output.targetMutation, accessors.getLatestMutation());
});
