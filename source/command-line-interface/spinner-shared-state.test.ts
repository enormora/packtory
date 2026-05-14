import assert from 'node:assert';
import { test } from 'mocha';
import { stub } from 'sinon';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

const probeTestTimeoutMs = 10_000;

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

const labelCapacity = 64;
const messageCapacity = 256;

test('writeSlot truncates labels that exceed the slot label capacity', () => {
    const accessors = createAccessors();

    accessors.writeSlot(0, 'running', 'a'.repeat(labelCapacity + 10), 'message');

    assert.strictEqual(accessors.readSlot(0).label, 'a'.repeat(labelCapacity));
});

test('writeSlot truncates messages that exceed the slot message capacity', () => {
    const accessors = createAccessors();

    accessors.writeSlot(0, 'running', 'label', 'b'.repeat(messageCapacity + 10));

    assert.strictEqual(accessors.readSlot(0).message, 'b'.repeat(messageCapacity));
});

test('readSlot returns empty strings when no content was written', () => {
    const accessors = createAccessors();

    assert.deepStrictEqual(accessors.readSlot(2), { state: 'empty', label: '', message: '' });
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

test('readSlot retries when the slot generation moves between the bracketing samples', () => {
    const accessors = createAccessors();
    accessors.writeSlot(0, 'running', 'pending-label', 'pending-message');
    accessors.bumpSlotGeneration(0);

    const realLoad = Atomics.load.bind(Atomics);
    const loadStub = stub(Atomics, 'load');
    loadStub.callsFake((typedArray, index) => {
        const result = realLoad(typedArray, index);
        if (loadStub.callCount === 1) {
            accessors.writeSlot(0, 'succeeded', 'final-label', 'final-message');
            accessors.bumpSlotGeneration(0);
        }
        return result;
    });

    try {
        const slot = accessors.readSlot(0);

        assert.deepStrictEqual(slot, {
            state: 'succeeded',
            label: 'final-label',
            message: 'final-message'
        });
        assert.ok(
            loadStub.callCount >= 3,
            `expected the seqlock retry path to read the generation at least three times, got ${loadStub.callCount}`
        );
    } finally {
        loadStub.restore();
    }
});

test('readSlot throws when the slot generation never stabilizes', () => {
    const accessors = createAccessors();
    accessors.writeSlot(0, 'running', 'pending-label', 'pending-message');

    const realLoad = Atomics.load.bind(Atomics);
    const loadStub = stub(Atomics, 'load');
    loadStub.callsFake((typedArray, index) => {
        const result = realLoad(typedArray, index);
        if (typedArray.constructor === Int32Array && index === 0) {
            accessors.bumpSlotGeneration(0);
        }
        return result;
    });

    try {
        assert.throws(() => {
            accessors.readSlot(0);
        }, /^Error: Failed to read a stable spinner slot snapshot$/u);
        assert.strictEqual(loadStub.callCount, 1025);
    } finally {
        loadStub.restore();
    }
});

test('readSlot completes promptly when a seqlock retry is needed', async () => {
    const result = await runNodeProbe(
        `
            import {
                createSpinnerSharedAccessors,
                createSpinnerSharedLayout
            } from './source/command-line-interface/spinner-shared-state.ts';

            const layout = createSpinnerSharedLayout(1);
            const buffer = new SharedArrayBuffer(layout.bufferByteLength);
            const accessors = createSpinnerSharedAccessors(buffer, layout);

            accessors.writeSlot(0, 'running', 'pending-label', 'pending-message');
            accessors.bumpSlotGeneration(0);

            const realLoad = Atomics.load.bind(Atomics);
            let callCount = 0;
            Atomics.load = (...args) => {
                const value = realLoad(...args);
                callCount += 1;
                if (callCount === 1) {
                    accessors.writeSlot(0, 'succeeded', 'final-label', 'final-message');
                    accessors.bumpSlotGeneration(0);
                }
                return value;
            };

            console.log(JSON.stringify(accessors.readSlot(0)));
        `,
        { timeoutMs: 3000 }
    );

    assert.deepStrictEqual(result, { state: 'succeeded', label: 'final-label', message: 'final-message' });
}).timeout(probeTestTimeoutMs);

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
