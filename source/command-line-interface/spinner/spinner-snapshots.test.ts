import assert from 'node:assert';
import { suite, test } from 'mocha';
import { findHighestActiveSlotIndex, readAllSnapshots, type SlotSnapshot } from './spinner-snapshots.ts';
import { createSpinnerSharedAccessors, createSpinnerSharedLayout } from './spinner-shared-state.ts';

function createAccessors(slotCount: number) {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    return createSpinnerSharedAccessors(buffer, layout);
}

suite('spinner-snapshots', function () {
    test('readAllSnapshots returns one snapshot per slot in slot order', function () {
        const accessors = createAccessors(3);
        accessors.writeSlot(0, 'running', 'pkg-a', 'msg-a');
        accessors.writeSlot(1, 'succeeded', 'pkg-b', 'msg-b');
        accessors.writeSlot(2, 'empty', '', '');

        const snapshots = readAllSnapshots(accessors);

        assert.strictEqual(snapshots.length, 3);
        assert.strictEqual(snapshots[0]?.label, 'pkg-a');
        assert.strictEqual(snapshots[1]?.state, 'succeeded');
    });

    test('findHighestActiveSlotIndex returns -1 when every slot is empty', function () {
        const snapshots: readonly SlotSnapshot[] = [
            { state: 'empty', label: '', message: '' },
            { state: 'empty', label: '', message: '' }
        ];
        assert.strictEqual(findHighestActiveSlotIndex(snapshots), -1);
    });

    test('findHighestActiveSlotIndex returns the index of the last non-empty slot', function () {
        const snapshots: readonly SlotSnapshot[] = [
            { state: 'running', label: 'a', message: '' },
            { state: 'empty', label: '', message: '' },
            { state: 'succeeded', label: 'c', message: '' },
            { state: 'empty', label: '', message: '' }
        ];
        assert.strictEqual(findHighestActiveSlotIndex(snapshots), 2);
    });
});
