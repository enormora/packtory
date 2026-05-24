import assert from 'node:assert';
import { suite, test } from 'mocha';
import { runNodeProbe } from '../../test-libraries/run-node-probe.ts';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

const probeTestTimeoutMs = 10_000;
type WaitResult = 'not-equal' | 'ok' | 'timed-out';

type AtomicsLike = {
    readonly add: (typedArray: Int32Array | Uint32Array, index: number, value: number) => number;
    readonly load: (typedArray: Int32Array | Uint32Array, index: number) => number;
    readonly notify: (typedArray: Int32Array, index: number, count?: number) => number;
    readonly store: (typedArray: Int32Array | Uint32Array, index: number, value: number) => number;
    readonly wait: (typedArray: Int32Array, index: number, value: number, timeout?: number) => WaitResult;
};

type ControlledAtomics = AtomicsLike & {
    loadCallCount: number;
    waitCallCount: number;
    readonly waitCalls: (readonly [number, number, number | undefined])[];
};

function createAccessors(
    slotCount = 4,
    dependencies: { readonly now?: () => number; readonly atomics?: AtomicsLike } = {}
): SpinnerSharedAccessors {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    return createSpinnerSharedAccessors(buffer, layout, dependencies);
}

function createNow(values: readonly number[]): () => number {
    let index = 0;
    return () => {
        const value = values[index] ?? values.at(-1);
        index += 1;
        if (value === undefined) {
            throw new Error('No timestamp configured for test clock');
        }
        return value;
    };
}

type ControlledAtomicsOverrides = {
    readonly load?: (typedArray: Int32Array | Uint32Array, index: number, realLoad: AtomicsLike['load']) => number;
    readonly wait?: (args: {
        readonly typedArray: Int32Array;
        readonly index: number;
        readonly value: number;
        readonly timeout: number | undefined;
        readonly realWait: AtomicsLike['wait'];
    }) => WaitResult;
};

function createControlledAtomics(overrides: ControlledAtomicsOverrides = {}): ControlledAtomics {
    const realAdd: AtomicsLike['add'] = (typedArray, index, value) => {
        return Atomics.add(typedArray, index, value);
    };
    const realLoad: AtomicsLike['load'] = (typedArray, index) => {
        return Atomics.load(typedArray, index);
    };
    const realNotify: AtomicsLike['notify'] = (typedArray, index, count) => {
        return Atomics.notify(typedArray, index, count);
    };
    const realStore: AtomicsLike['store'] = (typedArray, index, value) => {
        return Atomics.store(typedArray, index, value);
    };
    const realWait: AtomicsLike['wait'] = (typedArray, index, value, timeout) => {
        return Atomics.wait(typedArray, index, value, timeout);
    };
    const controlled: ControlledAtomics = {
        loadCallCount: 0,
        waitCallCount: 0,
        waitCalls: [],
        add: realAdd,
        load(typedArray, index) {
            controlled.loadCallCount += 1;
            return overrides.load?.(typedArray, index, realLoad) ?? realLoad(typedArray, index);
        },
        notify: realNotify,
        store: realStore,
        wait(typedArray, index, value, timeout) {
            controlled.waitCallCount += 1;
            controlled.waitCalls.push([index, value, timeout]);
            return (
                overrides.wait?.({ typedArray, index, value, timeout, realWait }) ??
                realWait(typedArray, index, value, timeout)
            );
        }
    };

    return controlled;
}

type WaitScenario = {
    readonly now: readonly number[];
    readonly renderedMutations: readonly number[];
    readonly waitResults?: readonly WaitResult[];
    readonly targetOffset?: number;
};

function runWaitScenario(scenario: WaitScenario): {
    readonly atomics: ControlledAtomics;
    readonly mutation: number;
    readonly result: boolean;
} {
    const waitResults = Array.from(scenario.waitResults ?? []);
    const renderedMutations = Array.from(scenario.renderedMutations);
    let mutation = 0;
    const atomics = createControlledAtomics({
        load(typedArray, index, realLoad) {
            if (index === 4) {
                return renderedMutations.shift() ?? mutation;
            }
            return realLoad(typedArray, index);
        },
        wait() {
            return waitResults.shift() ?? 'ok';
        }
    });
    const accessors = createAccessors(4, { now: createNow(scenario.now), atomics });
    mutation = accessors.markMutation() + (scenario.targetOffset ?? 0);
    return { atomics, mutation, result: accessors.waitForRenderedMutation(mutation, 10) };
}

suite('spinner-shared-state', function () {
    test('createSpinnerSharedLayout reports the byte length required to hold the header and slots', function () {
        const layout = createSpinnerSharedLayout(2);

        assert.strictEqual(layout.slotCount, 2);
        assert.strictEqual(layout.headerByteLength, 24);
        assert.strictEqual(layout.slotByteLength, 384);
        assert.strictEqual(layout.bufferByteLength, 24 + 2 * 384);
    });

    test('setColumns and getColumns round-trip the value', function () {
        const accessors = createAccessors();

        accessors.setColumns(120);

        assert.strictEqual(accessors.getColumns(), 120);
    });

    test('setIntervalMs and getIntervalMs round-trip the value', function () {
        const accessors = createAccessors();

        accessors.setIntervalMs(50);

        assert.strictEqual(accessors.getIntervalMs(), 50);
    });

    test('markMutation increments and getLatestMutation reads the latest mutation number', function () {
        const accessors = createAccessors();

        assert.strictEqual(accessors.getLatestMutation(), 0);
        assert.strictEqual(accessors.markMutation(), 1);
        assert.strictEqual(accessors.markMutation(), 2);
        assert.strictEqual(accessors.getLatestMutation(), 2);
    });

    test('waitForRenderedMutation returns true once the render was acknowledged', function () {
        const accessors = createAccessors();
        const mutation = accessors.markMutation();

        accessors.acknowledgeRender(mutation);

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), true);
    });

    test('waitForRenderedMutation returns immediately without waiting when the render is already caught up', function () {
        let mutation = 0;
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                return index === 4 ? mutation : realLoad(typedArray, index);
            }
        });
        const accessors = createAccessors(4, { now: createNow([100, 100]), atomics });
        mutation = accessors.markMutation();

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), true);
        assert.strictEqual(atomics.waitCallCount, 0);
    });

    test('waitForRenderedMutation times out when the render was not acknowledged', function () {
        const accessors = createAccessors();
        const mutation = accessors.markMutation();

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 1), false);
    });

    test('waitForRenderedMutation returns once the render catches up between loop checks', function () {
        let renderedMutationLoadCount = 0;
        let mutation = 0;
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                if (index === 4) {
                    renderedMutationLoadCount += 1;
                    if (renderedMutationLoadCount === 1) {
                        return 0;
                    }
                    return mutation;
                }
                return realLoad(typedArray, index);
            }
        });
        const accessors = createAccessors(4, { atomics });
        mutation = accessors.markMutation();

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), true);
    });

    test('waitForRenderedMutation waits with the current rendered mutation and the remaining timeout', function () {
        let renderedMutationLoadCount = 0;
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                if (index === 4) {
                    renderedMutationLoadCount += 1;
                    return 0;
                }
                return realLoad(typedArray, index);
            },
            wait() {
                return 'timed-out';
            }
        });
        const accessors = createAccessors(4, { now: createNow([100, 105, 110]), atomics });
        const mutation = accessors.markMutation();

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
        assert.strictEqual(atomics.waitCallCount, 1);
        assert.strictEqual(renderedMutationLoadCount, 2);
        assert.deepStrictEqual(atomics.waitCalls[0], [4, 0, 5]);
    });

    test('waitForRenderedMutation returns true after a wait once the rendered mutation reaches the target', function () {
        let renderedMutationLoadCount = 0;
        let mutation = 0;
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                if (index === 4) {
                    renderedMutationLoadCount += 1;
                    return renderedMutationLoadCount === 1 ? 0 : mutation;
                }
                return realLoad(typedArray, index);
            },
            wait() {
                return 'ok';
            }
        });
        const accessors = createAccessors(4, { now: createNow([100, 100, 100]), atomics });
        mutation = accessors.markMutation();

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), true);
        assert.strictEqual(atomics.waitCallCount, 1);
        assert.deepStrictEqual(atomics.waitCalls[0], [4, 0, 10]);
    });

    test('waitForRenderedMutation keeps waiting after a timeout when the rendered mutation still makes progress', function () {
        const { atomics, result } = runWaitScenario({
            now: [100, 100, 101, 101, 102],
            renderedMutations: [0, 1, 1],
            waitResults: ['timed-out', 'ok'],
            targetOffset: 1
        });

        assert.strictEqual(result, true);
        assert.strictEqual(atomics.waitCallCount, 2);
        assert.deepStrictEqual(atomics.waitCalls[0], [4, 0, 10]);
        assert.deepStrictEqual(atomics.waitCalls[1], [4, 1, 9]);
    });

    test('waitForRenderedMutation returns false when the remaining timeout grows without render progress', function () {
        let renderedMutationLoadCount = 0;
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                if (index === 4) {
                    renderedMutationLoadCount += 1;
                    return 0;
                }
                return realLoad(typedArray, index);
            },
            wait() {
                return 'ok';
            }
        });
        const accessors = createAccessors(4, { now: createNow([100, 105, 90]), atomics });
        const mutation = accessors.markMutation();

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
        assert.strictEqual(atomics.waitCallCount, 1);
        assert.strictEqual(renderedMutationLoadCount, 2);
    });

    test('waitForRenderedMutation keeps polling when no progress was made but the remaining timeout still shrank', function () {
        const { atomics, result } = runWaitScenario({
            now: [100, 100, 101, 101, 102],
            renderedMutations: [0, 0, 0],
            waitResults: ['ok', 'ok']
        });

        assert.strictEqual(result, true);
        assert.strictEqual(atomics.waitCallCount, 2);
        assert.deepStrictEqual(atomics.waitCalls[0], [4, 0, 10]);
        assert.deepStrictEqual(atomics.waitCalls[1], [4, 0, 9]);
    });

    test('waitForRenderedMutation keeps polling when no progress was made and the remaining timeout stayed the same', function () {
        const { atomics, result } = runWaitScenario({
            now: [100, 100, 100, 100, 101],
            renderedMutations: [0, 0, 0],
            waitResults: ['ok', 'ok']
        });

        assert.strictEqual(result, true);
        assert.strictEqual(atomics.waitCallCount, 2);
        assert.deepStrictEqual(atomics.waitCalls[0], [4, 0, 10]);
        assert.deepStrictEqual(atomics.waitCalls[1], [4, 0, 10]);
    });

    test('waitForRenderedMutation keeps polling when progress was made even if the remaining timeout grows', function () {
        const { atomics, result } = runWaitScenario({
            now: [100, 105, 90, 90, 91],
            renderedMutations: [0, 1, 1],
            waitResults: ['ok', 'ok'],
            targetOffset: 1
        });

        assert.strictEqual(result, true);
        assert.strictEqual(atomics.waitCallCount, 2);
        assert.deepStrictEqual(atomics.waitCalls[0], [4, 0, 5]);
        assert.deepStrictEqual(atomics.waitCalls[1], [4, 1, 10]);
    });

    test('waitForRenderedMutation returns true when a wait step reaches the target mutation exactly', function () {
        const renderedMutations = [0];
        const waitResults: WaitResult[] = ['ok', 'timed-out'];
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                if (index === 4) {
                    return renderedMutations.shift() ?? 0;
                }
                return realLoad(typedArray, index);
            },
            wait() {
                return waitResults.shift() ?? 'timed-out';
            }
        });
        const accessors = createAccessors(4, { now: createNow([100, 100, 101, 102, 110]), atomics });
        const mutation = accessors.markMutation();
        renderedMutations.push(mutation, 0, 0);

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), true);
        assert.strictEqual(atomics.waitCallCount, 1);
    });

    test('waitForRenderedMutation times out immediately when the timeout has already elapsed', function () {
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                return index === 4 ? 0 : realLoad(typedArray, index);
            }
        });
        const accessors = createAccessors(4, { now: createNow([100, 110]), atomics });
        const mutation = accessors.markMutation();

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
        assert.strictEqual(atomics.waitCallCount, 0);
    });

    test('waitForRenderedMutation stops after the maximum number of polling attempts', function () {
        const now = (() => {
            let current = 0;
            return () => {
                current += 1;
                return current;
            };
        })();
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                return index === 4 ? 0 : realLoad(typedArray, index);
            },
            wait() {
                return 'ok';
            }
        });
        const accessors = createAccessors(4, { now, atomics });
        const mutation = accessors.markMutation();

        assert.strictEqual(accessors.waitForRenderedMutation(mutation, 1000), false);
        assert.strictEqual(atomics.waitCallCount, 256);
    });

    test('isShutdownRequested returns false until requestShutdown is called', function () {
        const accessors = createAccessors();

        assert.strictEqual(accessors.isShutdownRequested(), false);
        accessors.requestShutdown();
        assert.strictEqual(accessors.isShutdownRequested(), true);
    });

    test('writeSlot stores state, label and message readable via readSlot', function () {
        const accessors = createAccessors();

        accessors.writeSlot(1, 'running', 'label-one', 'message-one');

        assert.deepStrictEqual(accessors.readSlot(1), {
            state: 'running',
            label: 'label-one',
            message: 'message-one'
        });
    });

    test('writeSlot handles each declared slot state', function () {
        const accessors = createAccessors();

        for (const state of ['running', 'succeeded', 'failed', 'canceled', 'empty'] as const) {
            accessors.writeSlot(0, state, 'label', 'message');
            assert.strictEqual(accessors.readSlot(0).state, state);
        }
    });

    test('writeSlot replaces previously written content with shorter content', function () {
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

    test('writeSlot truncates labels that exceed the slot label capacity', function () {
        const accessors = createAccessors();

        accessors.writeSlot(0, 'running', 'a'.repeat(labelCapacity + 10), 'message');

        assert.strictEqual(accessors.readSlot(0).label, 'a'.repeat(labelCapacity));
    });

    test('writeSlot truncates messages that exceed the slot message capacity', function () {
        const accessors = createAccessors();

        accessors.writeSlot(0, 'running', 'label', 'b'.repeat(messageCapacity + 10));

        assert.strictEqual(accessors.readSlot(0).message, 'b'.repeat(messageCapacity));
    });

    test('readSlot returns empty strings when no content was written', function () {
        const accessors = createAccessors();

        assert.deepStrictEqual(accessors.readSlot(2), { state: 'empty', label: '', message: '' });
    });

    test('writeSlot and readSlot operate independently per slot', function () {
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

    test('setColumns and setIntervalMs default to zero before being assigned', function () {
        const accessors = createAccessors();

        assert.strictEqual(accessors.getColumns(), 0);
        assert.strictEqual(accessors.getIntervalMs(), 0);
    });

    test('setColumns does not affect the stored interval', function () {
        const accessors = createAccessors();
        accessors.setIntervalMs(50);

        accessors.setColumns(120);

        assert.strictEqual(accessors.getIntervalMs(), 50);
    });

    test('setIntervalMs does not affect the stored columns', function () {
        const accessors = createAccessors();
        accessors.setColumns(120);

        accessors.setIntervalMs(50);

        assert.strictEqual(accessors.getColumns(), 120);
    });

    test('setColumns does not raise the shutdown flag', function () {
        const accessors = createAccessors();

        accessors.setColumns(120);

        assert.strictEqual(accessors.isShutdownRequested(), false);
    });

    test('setIntervalMs does not raise the shutdown flag', function () {
        const accessors = createAccessors();

        accessors.setIntervalMs(50);

        assert.strictEqual(accessors.isShutdownRequested(), false);
    });

    test('requestShutdown does not change the stored columns or interval', function () {
        const accessors = createAccessors();
        accessors.setColumns(120);
        accessors.setIntervalMs(50);

        accessors.requestShutdown();

        assert.strictEqual(accessors.getColumns(), 120);
        assert.strictEqual(accessors.getIntervalMs(), 50);
    });

    test('readSlot retries when the slot generation moves between the bracketing samples', function () {
        let accessors = createAccessors();
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                const result = realLoad(typedArray, index);
                if (index === 0 && atomics.loadCallCount === 1) {
                    accessors.writeSlot(0, 'succeeded', 'final-label', 'final-message');
                    accessors.bumpSlotGeneration(0);
                }
                return result;
            }
        });
        accessors = createAccessors(4, { atomics });
        accessors.writeSlot(0, 'running', 'pending-label', 'pending-message');
        accessors.bumpSlotGeneration(0);

        const slot = accessors.readSlot(0);

        assert.deepStrictEqual(slot, {
            state: 'succeeded',
            label: 'final-label',
            message: 'final-message'
        });
        assert.ok(
            atomics.loadCallCount >= 3,
            `expected the seqlock retry path to read the generation at least three times, got ${atomics.loadCallCount}`
        );
    });

    test('readSlot throws when the slot generation never stabilizes', function () {
        let accessors = createAccessors();
        const atomics = createControlledAtomics({
            load(typedArray, index, realLoad) {
                const result = realLoad(typedArray, index);
                if (typedArray.constructor === Int32Array && index === 0) {
                    accessors.bumpSlotGeneration(0);
                }
                return result;
            }
        });
        accessors = createAccessors(4, { atomics });
        accessors.writeSlot(0, 'running', 'pending-label', 'pending-message');

        assert.throws(() => {
            accessors.readSlot(0);
        }, /^Error: Failed to read a stable spinner slot snapshot$/u);
        assert.strictEqual(atomics.loadCallCount, 1025);
    });

    test('readSlot completes promptly when a seqlock retry is needed', async function () {
        const result = await runNodeProbe(
            `
                import {
                    createSpinnerSharedAccessors,
                    createSpinnerSharedLayout
                } from './source/command-line-interface/spinner/spinner-shared-state.ts';

                const layout = createSpinnerSharedLayout(1);
                const buffer = new SharedArrayBuffer(layout.bufferByteLength);
                let accessors = createSpinnerSharedAccessors(buffer, layout);

                accessors.writeSlot(0, 'running', 'pending-label', 'pending-message');
                accessors.bumpSlotGeneration(0);

                let callCount = 0;
                const atomics = {
                    add: Atomics.add,
                    load(...args) {
                        const value = Atomics.load(...args);
                        callCount += 1;
                        if (callCount === 1) {
                            accessors.writeSlot(0, 'succeeded', 'final-label', 'final-message');
                            accessors.bumpSlotGeneration(0);
                        }
                        return value;
                    },
                    notify: Atomics.notify,
                    store: Atomics.store,
                    wait: Atomics.wait
                };
                accessors = createSpinnerSharedAccessors(buffer, layout, { atomics });
                accessors.writeSlot(0, 'running', 'pending-label', 'pending-message');
                accessors.bumpSlotGeneration(0);

                console.log(JSON.stringify(accessors.readSlot(0)));
            `,
            { timeoutMs: 3000 }
        );

        assert.deepStrictEqual(result, { state: 'succeeded', label: 'final-label', message: 'final-message' });
    }).timeout(probeTestTimeoutMs);

    test('writeSlot then readSlot round-trips strings that contain multi-byte UTF-8 characters', function () {
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
});
