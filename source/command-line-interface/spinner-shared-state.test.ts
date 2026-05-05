import assert from 'node:assert';
import { test } from 'mocha';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

function createAccessors(slotCount = 4): SpinnerSharedAccessors {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    return createSpinnerSharedAccessors(buffer, layout);
}

test('createSpinnerSharedLayout reports the byte length required to hold the header and slots', () => {
    const layout = createSpinnerSharedLayout(2);

    assert.strictEqual(layout.slotCount, 2);
    assert.strictEqual(layout.headerByteLength, 16);
    assert.strictEqual(layout.slotByteLength, 384);
    assert.strictEqual(layout.bufferByteLength, 16 + 2 * 384);
    assert.strictEqual(layout.maxLabelByteLength, 64);
    assert.strictEqual(layout.maxMessageByteLength, 256);
});

test('setColumns and getColumns round-trip the value', () => {
    const accessors = createAccessors();

    accessors.setColumns(120);

    assert.strictEqual(accessors.getColumns(), 120);
});

test('setIntervalMs and getIntervalMs round-trip the value', () => {
    const accessors = createAccessors();

    accessors.setIntervalMs(50);

    assert.strictEqual(accessors.getIntervalMs(), 50);
});

test('isShutdownRequested returns false until requestShutdown is called', () => {
    const accessors = createAccessors();

    assert.strictEqual(accessors.isShutdownRequested(), false);
    accessors.requestShutdown();
    assert.strictEqual(accessors.isShutdownRequested(), true);
});

test('writeSlot stores state, label and message readable via readSlot', () => {
    const accessors = createAccessors();

    accessors.writeSlot(1, 'running', 'label-one', 'message-one');

    assert.deepStrictEqual(accessors.readSlot(1), {
        state: 'running',
        label: 'label-one',
        message: 'message-one'
    });
});

test('writeSlot handles each declared slot state', () => {
    const accessors = createAccessors();

    for (const state of ['running', 'succeeded', 'failed', 'canceled', 'empty'] as const) {
        accessors.writeSlot(0, state, 'label', 'message');
        assert.strictEqual(accessors.readSlot(0).state, state);
    }
});

test('writeSlot replaces previously written content with shorter content', () => {
    const accessors = createAccessors();

    accessors.writeSlot(0, 'running', 'long-label', 'long-message-that-spans-many-bytes');
    accessors.writeSlot(0, 'succeeded', 'short', 'tiny');

    assert.deepStrictEqual(accessors.readSlot(0), {
        state: 'succeeded',
        label: 'short',
        message: 'tiny'
    });
});

test('writeSlot truncates labels that exceed the maximum byte length', () => {
    const accessors = createAccessors();
    const layout = createSpinnerSharedLayout(1);
    const oversizedLabel = 'a'.repeat(layout.maxLabelByteLength + 10);

    accessors.writeSlot(0, 'running', oversizedLabel, 'message');

    assert.strictEqual(accessors.readSlot(0).label, 'a'.repeat(layout.maxLabelByteLength));
});

test('writeSlot truncates messages that exceed the maximum byte length', () => {
    const accessors = createAccessors();
    const layout = createSpinnerSharedLayout(1);
    const oversizedMessage = 'b'.repeat(layout.maxMessageByteLength + 10);

    accessors.writeSlot(0, 'running', 'label', oversizedMessage);

    assert.strictEqual(accessors.readSlot(0).message, 'b'.repeat(layout.maxMessageByteLength));
});

test('readSlot returns empty strings when no content was written', () => {
    const accessors = createAccessors();

    assert.deepStrictEqual(accessors.readSlot(2), { state: 'empty', label: '', message: '' });
});

test('setSlotEmpty resets the slot state and clears the stored label and message', () => {
    const accessors = createAccessors();
    accessors.writeSlot(0, 'running', 'label', 'message');

    accessors.setSlotEmpty(0);

    assert.deepStrictEqual(accessors.readSlot(0), { state: 'empty', label: '', message: '' });
});

test('readSlotGeneration starts at zero and increments for each bumpSlotGeneration call', () => {
    const accessors = createAccessors();

    assert.strictEqual(accessors.readSlotGeneration(0), 0);
    accessors.bumpSlotGeneration(0);
    assert.strictEqual(accessors.readSlotGeneration(0), 1);
    accessors.bumpSlotGeneration(0);
    assert.strictEqual(accessors.readSlotGeneration(0), 2);
});

test('bumpSlotGeneration only affects the targeted slot', () => {
    const accessors = createAccessors();

    accessors.bumpSlotGeneration(0);

    assert.strictEqual(accessors.readSlotGeneration(0), 1);
    assert.strictEqual(accessors.readSlotGeneration(1), 0);
});

test('writeSlot and readSlot operate independently per slot', () => {
    const accessors = createAccessors();

    accessors.writeSlot(0, 'running', 'first-label', 'first-message');
    accessors.writeSlot(2, 'failed', 'third-label', 'third-message');

    assert.deepStrictEqual(accessors.readSlot(0), {
        state: 'running',
        label: 'first-label',
        message: 'first-message'
    });
    assert.deepStrictEqual(accessors.readSlot(1), { state: 'empty', label: '', message: '' });
    assert.deepStrictEqual(accessors.readSlot(2), {
        state: 'failed',
        label: 'third-label',
        message: 'third-message'
    });
});

test('readSlot maps an unknown state byte to the empty state', () => {
    const layout = createSpinnerSharedLayout(1);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    const accessors = createSpinnerSharedAccessors(buffer, layout);
    const slotStateOffset = layout.headerByteLength + 4;
    new DataView(buffer).setUint8(slotStateOffset, 99);

    assert.strictEqual(accessors.readSlot(0).state, 'empty');
});

test('setColumns and setIntervalMs default to zero before being assigned', () => {
    const accessors = createAccessors();

    assert.strictEqual(accessors.getColumns(), 0);
    assert.strictEqual(accessors.getIntervalMs(), 0);
});

test('setColumns does not affect the stored interval', () => {
    const accessors = createAccessors();
    accessors.setIntervalMs(50);

    accessors.setColumns(120);

    assert.strictEqual(accessors.getIntervalMs(), 50);
});

test('setIntervalMs does not affect the stored columns', () => {
    const accessors = createAccessors();
    accessors.setColumns(120);

    accessors.setIntervalMs(50);

    assert.strictEqual(accessors.getColumns(), 120);
});

test('setColumns does not raise the shutdown flag', () => {
    const accessors = createAccessors();

    accessors.setColumns(120);

    assert.strictEqual(accessors.isShutdownRequested(), false);
});

test('setIntervalMs does not raise the shutdown flag', () => {
    const accessors = createAccessors();

    accessors.setIntervalMs(50);

    assert.strictEqual(accessors.isShutdownRequested(), false);
});

test('requestShutdown does not change the stored columns or interval', () => {
    const accessors = createAccessors();
    accessors.setColumns(120);
    accessors.setIntervalMs(50);

    accessors.requestShutdown();

    assert.strictEqual(accessors.getColumns(), 120);
    assert.strictEqual(accessors.getIntervalMs(), 50);
});

test('writeSlot then readSlot round-trips strings that contain multi-byte UTF-8 characters', () => {
    const accessors = createAccessors();
    const decoder = new TextDecoder();
    const multibyteLabel = decoder.decode(new Uint8Array([209, 130, 208, 181, 209, 129, 209, 130]));
    const multibyteMessage = decoder.decode(new Uint8Array([195, 169, 36, 195, 188]));

    accessors.writeSlot(0, 'running', multibyteLabel, multibyteMessage);

    assert.deepStrictEqual(accessors.readSlot(0), {
        state: 'running',
        label: multibyteLabel,
        message: multibyteMessage
    });
});

test('bumpSlotGeneration on one slot does not modify any other slot generation', () => {
    const accessors = createAccessors(4);

    accessors.bumpSlotGeneration(2);

    assert.strictEqual(accessors.readSlotGeneration(0), 0);
    assert.strictEqual(accessors.readSlotGeneration(1), 0);
    assert.strictEqual(accessors.readSlotGeneration(2), 1);
    assert.strictEqual(accessors.readSlotGeneration(3), 0);
});
