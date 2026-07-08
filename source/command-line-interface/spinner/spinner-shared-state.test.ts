import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

type WaitResult = 'not-equal' | 'ok' | 'timed-out';
type AtomicNumberArray = Int32Array | Uint32Array;
type AtomicNumberUpdate = (target: AtomicNumberArray, offset: number, amount: number) => number;
type AtomicNumberRead = (target: AtomicNumberArray, offset: number) => number;
type AtomicNumberNotify = (target: Int32Array, offset: number, count?: number) => number;
type AtomicNumberWait = (
    target: Int32Array,
    offset: number,
    expected: number,
    timeout?: number
) => WaitResult;
type SpinnerSharedAtomics = {
    readonly add: AtomicNumberUpdate;
    readonly load: AtomicNumberRead;
    readonly notify: AtomicNumberNotify;
    readonly store: AtomicNumberUpdate;
    readonly wait: AtomicNumberWait;
};

type ControlledAtomics = SpinnerSharedAtomics & {
    readonly loadCallCount: number;
    readonly waitCallCount: number;
    readonly waitCalls: readonly (readonly [number, number, number | undefined])[];
};
type CreateAccessorsDependencies = {
    readonly now?: () => number;
    readonly atomics?: SpinnerSharedAtomics;
};

function createAccessors(
    slotCount = 4,
    dependencies: CreateAccessorsDependencies = {}
): SpinnerSharedAccessors {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    return createSpinnerSharedAccessors(buffer, layout, dependencies);
}

function createNow(values: readonly number[]): () => number {
    let index = 0;
    return function () {
        const value = values[index] ?? values.at(-1);
        index += 1;
        if (value === undefined) {
            throw new Error('No timestamp configured for test clock');
        }
        return value;
    };
}

type ControlledAtomicsOverrides = {
    readonly load?: (
        typedArray: Int32Array | Uint32Array,
        index: number,
        realLoad: SpinnerSharedAtomics['load']
    ) => number;
    readonly wait?: (args: ControlledWaitArgs) => WaitResult;
};
type ControlledWaitArgs = {
    readonly typedArray: Int32Array;
    readonly index: number;
    readonly value: number;
    readonly timeout: number | undefined;
    readonly realWait: SpinnerSharedAtomics['wait'];
};

function createControlledAtomics(overrides: ControlledAtomicsOverrides = {}): ControlledAtomics {
    let loadCallCount = 0;
    let waitCallCount = 0;
    const waitCalls: (readonly [number, number, number | undefined])[] = [];
    const realAdd: SpinnerSharedAtomics['add'] = function (typedArray, index, value) {
        return Atomics.add(typedArray, index, value);
    };
    const realLoad: SpinnerSharedAtomics['load'] = function (typedArray, index) {
        return Atomics.load(typedArray, index);
    };
    const realNotify: SpinnerSharedAtomics['notify'] = function (typedArray, index, count) {
        return Atomics.notify(typedArray, index, count);
    };
    const realStore: SpinnerSharedAtomics['store'] = function (typedArray, index, value) {
        return Atomics.store(typedArray, index, value);
    };
    const realWait: SpinnerSharedAtomics['wait'] = function (typedArray, index, value, timeout) {
        return Atomics.wait(typedArray, index, value, timeout);
    };
    const controlled: ControlledAtomics = {
        get loadCallCount() {
            return loadCallCount;
        },
        get waitCallCount() {
            return waitCallCount;
        },
        get waitCalls() {
            return waitCalls;
        },
        add: realAdd,
        load(typedArray, index) {
            loadCallCount += 1;
            return overrides.load?.(typedArray, index, realLoad) ?? realLoad(typedArray, index);
        },
        notify: realNotify,
        store: realStore,
        wait(typedArray, index, value, timeout) {
            waitCallCount += 1;
            waitCalls.push([ index, value, timeout ]);
            const configuredResult = overrides.wait?.({ typedArray, index, value, timeout, realWait });
            return configuredResult ?? realWait(typedArray, index, value, timeout);
        }
    };

    return controlled;
}

function createRenderedMutationAtomics(
    renderedMutations: readonly number[],
    waitResults: readonly WaitResult[]
): ControlledAtomics {
    const remainingRenderedMutations = Array.from(renderedMutations);
    const remainingWaitResults = Array.from(waitResults);
    return createControlledAtomics({
        load(typedArray, index, realLoad) {
            if (index === 4) {
                return remainingRenderedMutations.shift() ?? (renderedMutations.at(-1) ?? 0);
            }
            return realLoad(typedArray, index);
        },
        wait() {
            return remainingWaitResults.shift() ?? (waitResults.at(-1) ?? 'ok');
        }
    });
}

function createOkWaitAtomics(): ControlledAtomics {
    return createControlledAtomics({
        wait() {
            return 'ok';
        }
    });
}

function firstWaitCall(atomics: ControlledAtomics): readonly [number, number, number | undefined] {
    const waitCall = atomics.waitCalls[0];
    if (waitCall === undefined) {
        assert.fail('Expected a recorded Atomics.wait call');
    }
    return waitCall;
}

suite('spinner-shared-state', function () {
    suite('basics', function () {
        test('createSpinnerSharedLayout reports the byte length required to hold the header and slots', function () {
            const layout = createSpinnerSharedLayout(2);

            assert.partialDeepStrictEqual(layout, {
                slotCount: 2,
                headerByteLength: 24,
                slotByteLength: 384,
                bufferByteLength: 24 + 2 * 384
            });
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
    });

    suite('render waits', function () {
        suite('completion', function () {
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
                const accessors = createAccessors(4, { now: createNow([ 100, 100 ]), atomics });
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
                const accessors = createAccessors(4, { now: createNow([ 100, 105, 110 ]), atomics });
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
                assert.strictEqual(atomics.waitCallCount, 1);
                assert.strictEqual(renderedMutationLoadCount, 2);
                assert.deepStrictEqual(atomics.waitCalls[0], [ 4, 0, 5 ]);
            });
        });

        suite('timeout retry', function () {
            test('waitForRenderedMutation stops after a timed out wait with no rendered progress', function () {
                const atomics = createControlledAtomics({
                    wait() {
                        return 'timed-out';
                    }
                });
                const accessors = createAccessors(4, { now: createNow([ 100, 100, 100 ]), atomics });
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
                assert.strictEqual(atomics.waitCallCount, 1);
            });

            test('waitForRenderedMutation continues after a timed out wait when rendering made progress', function () {
                const atomics = createRenderedMutationAtomics([ 0, 1, 1, 2 ], [ 'timed-out', 'ok' ]);
                const accessors = createAccessors(4, { now: createNow([ 100, 100, 105, 106 ]), atomics });
                accessors.markMutation();
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), true);
                assert.strictEqual(atomics.waitCallCount, 2);
                assert.deepStrictEqual(atomics.waitCalls[1], [ 4, 1, 5 ]);
            });

            test('waitForRenderedMutation continues when time moves backward after rendered progress', function () {
                const atomics = createRenderedMutationAtomics([ 0, 1, 1, 2 ], [ 'ok' ]);
                const accessors = createAccessors(4, { now: createNow([ 100, 100, 95, 96 ]), atomics });
                accessors.markMutation();
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), true);
                assert.strictEqual(atomics.waitCallCount, 2);
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
                const accessors = createAccessors(4, { now: createNow([ 100, 100, 100 ]), atomics });
                mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), true);
                assert.strictEqual(atomics.waitCallCount, 1);
                assert.deepStrictEqual(atomics.waitCalls[0], [ 4, 0, 10 ]);
            });
        });

        suite('attempt budgets', function () {
            test('waitForRenderedMutation returns a reached target within a single-attempt budget', function () {
                const atomics = createRenderedMutationAtomics([ 0, 1, 0 ], [ 'ok' ]);
                const accessors = createAccessors(4, { now: createNow([ 100, 100, 100 ]), atomics });
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 0.1), true);
                assert.strictEqual(atomics.waitCallCount, 1);
            });

            test('waitForRenderedMutation returns false without waiting when no time remains', function () {
                const atomics = createControlledAtomics();
                const accessors = createAccessors(4, { now: createNow([ 100, 100 ]), atomics });
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 0), false);
                assert.strictEqual(atomics.waitCallCount, 0);
            });

            test('waitForRenderedMutation stops when time appears to move backward during a wait', function () {
                const atomics = createOkWaitAtomics();
                const accessors = createAccessors(4, { now: createNow([ 100, 100, 95 ]), atomics });
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
                assert.strictEqual(atomics.waitCallCount, 1);
            });

            test('waitForRenderedMutation caps retry attempts for long timeouts', function () {
                const atomics = createOkWaitAtomics();
                const accessors = createAccessors(4, { now: createNow([ 100 ]), atomics });
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 1000), false);
                assert.strictEqual(atomics.waitCallCount, 256);
            });

            test('waitForRenderedMutation exhausts the attempt budget with the latest rendered progress', function () {
                const atomics = createRenderedMutationAtomics([ 0, 1, 1 ], [ 'ok' ]);
                const accessors = createAccessors(4, { now: createNow([ 100 ]), atomics });
                accessors.markMutation();
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 0.1), false);
                assert.strictEqual(atomics.waitCallCount, 1);
            });

            test('waitForRenderedMutation uses at least one retry for fractional timeouts', function () {
                const atomics = createOkWaitAtomics();
                const accessors = createAccessors(4, { now: createNow([ 100 ]), atomics });
                const mutation = accessors.markMutation();

                assert.strictEqual(accessors.waitForRenderedMutation(mutation, 0.1), false);
                assert.strictEqual(atomics.waitCallCount, 1);
                const [ index, value, timeout ] = firstWaitCall(atomics);
                assert.strictEqual(index, 4);
                assert.strictEqual(value, 0);
                assert.ok((timeout ?? 0) > 0);
                assert.ok((timeout ?? 1) <= 0.1);
            });
        });
    });

    suite('slots and control', function () {
        test('requestShutdown changes shutdown state', function () {
            const accessors = createAccessors();

            assert.strictEqual(accessors.isShutdownRequested(), false);
            accessors.requestShutdown();
            assert.strictEqual(accessors.isShutdownRequested(), true);
        });

        test('writeSlot and readSlot round-trip every slot state', function () {
            const accessors = createAccessors(5);
            const states = [ 'empty', 'running', 'succeeded', 'failed', 'canceled' ] as const;

            for (const [ index, state ] of states.entries()) {
                accessors.writeSlot(index, state, `label-${state}`, `message-${state}`);
                assert.deepStrictEqual(accessors.readSlot(index), {
                    state,
                    label: `label-${state}`,
                    message: `message-${state}`
                });
            }
        });

        test('writeSlot truncates label and message content to their slot capacities', function () {
            const accessors = createAccessors();
            const label = 'l'.repeat(100);
            const message = 'm'.repeat(300);

            accessors.writeSlot(0, 'running', label, message);

            assert.deepStrictEqual(accessors.readSlot(0), {
                state: 'running',
                label: 'l'.repeat(64),
                message: 'm'.repeat(256)
            });
        });

        test('readSlot rejects unknown slot state bytes', function () {
            const accessors = createAccessors();
            const view = new DataView(
                accessors.buffer,
                accessors.layout.headerByteLength,
                accessors.layout.slotByteLength
            );
            view.setUint8(4, 99);

            assert.throws(function () {
                accessors.readSlot(0);
            }, { message: 'Unknown spinner slot state byte 99' });
        });

        test('readSlot rejects slots whose generation never stabilizes', function () {
            let slotGeneration = 0;
            const atomics = createControlledAtomics({
                load(typedArray, index, realLoad) {
                    if (typedArray.length === 1 && index === 0) {
                        slotGeneration += 1;
                        return slotGeneration;
                    }
                    return realLoad(typedArray, index);
                }
            });
            const accessors = createAccessors(4, { atomics });
            accessors.writeSlot(0, 'running', 'pkg', 'building');

            assert.throws(function () {
                accessors.readSlot(0);
            }, { message: 'Failed to read a stable spinner slot snapshot after 1024 attempts' });
            assert.strictEqual(slotGeneration, 1025);
        });

        test('bumpSlotGeneration increments the selected slot generation', function () {
            const atomics = createControlledAtomics();
            const accessors = createAccessors(4, { atomics });
            const slotOffset = accessors.layout.headerByteLength + 2 * accessors.layout.slotByteLength;

            accessors.bumpSlotGeneration(2);

            assert.strictEqual(
                atomics.load(
                    new Int32Array(accessors.buffer, slotOffset, 1),
                    0
                ),
                1
            );
        });
    });
});
