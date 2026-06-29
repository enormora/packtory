import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

type WaitResult = 'not-equal' | 'ok' | 'timed-out';

type AtomicsLike = {
    add: (typedArray: Int32Array | Uint32Array, index: number, value: number) => number;
    load: (typedArray: Int32Array | Uint32Array, index: number) => number;
    notify: (typedArray: Int32Array, index: number, count?: number) => number;
    store: (typedArray: Int32Array | Uint32Array, index: number, value: number) => number;
    wait: (typedArray: Int32Array, index: number, value: number, timeout?: number) => WaitResult;
};

type ControlledAtomics = AtomicsLike & {
    readonly loadCallCount: number;
    readonly waitCallCount: number;
    readonly waitCalls: readonly (readonly [number, number, number | undefined])[];
};
type CreateAccessorsDependencies = {
    readonly now?: () => number;
    readonly atomics?: AtomicsLike;
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
    readonly load?: (typedArray: Int32Array | Uint32Array, index: number, realLoad: AtomicsLike['load']) => number;
    readonly wait?: (args: ControlledWaitArgs) => WaitResult;
};
type ControlledWaitArgs = {
    readonly typedArray: Int32Array;
    readonly index: number;
    readonly value: number;
    readonly timeout: number | undefined;
    readonly realWait: AtomicsLike['wait'];
};
type RenderedMutationLoadCounter = {
    readonly atomics: ControlledAtomics;
    readonly getLoadCount: () => number;
};

function createControlledAtomics(overrides: ControlledAtomicsOverrides = {}): ControlledAtomics {
    let loadCallCount = 0;
    let waitCallCount = 0;
    const waitCalls: (readonly [number, number, number | undefined])[] = [];
    const realAdd: AtomicsLike['add'] = function (typedArray, index, value) {
        return Atomics.add(typedArray, index, value);
    };
    const realLoad: AtomicsLike['load'] = function (typedArray, index) {
        return Atomics.load(typedArray, index);
    };
    const realNotify: AtomicsLike['notify'] = function (typedArray, index, count) {
        return Atomics.notify(typedArray, index, count);
    };
    const realStore: AtomicsLike['store'] = function (typedArray, index, value) {
        return Atomics.store(typedArray, index, value);
    };
    const realWait: AtomicsLike['wait'] = function (typedArray, index, value, timeout) {
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

function createRenderedMutationLoadCounter(waitResult: WaitResult): RenderedMutationLoadCounter {
    let loadCount = 0;
    const atomics = createControlledAtomics({
        load(typedArray, index, realLoad) {
            if (index !== 4) {
                return realLoad(typedArray, index);
            }
            loadCount += 1;
            return 0;
        },
        wait() {
            return waitResult;
        }
    });
    return {
        atomics,
        getLoadCount() {
            return loadCount;
        }
    };
}

type WaitScenario = {
    readonly now: readonly number[];
    readonly renderedMutations: readonly number[];
    readonly waitResults?: readonly WaitResult[];
    readonly targetOffset?: number;
};
type WaitScenarioResult = {
    readonly atomics: ControlledAtomics;
    readonly result: boolean;
};

function runWaitScenario(scenario: WaitScenario): WaitScenarioResult {
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
    return { atomics, result: accessors.waitForRenderedMutation(mutation, 10) };
}

suite('spinner-shared-state basics and waits', function () {
    suite('shared layout and slots', function () {
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

        test('readSlot rejects unknown state bytes', function () {
            const layout = createSpinnerSharedLayout(1);
            const buffer = new SharedArrayBuffer(layout.bufferByteLength);
            const accessors = createSpinnerSharedAccessors(buffer, layout);
            const slotData = new DataView(buffer, layout.headerByteLength, layout.slotByteLength);
            slotData.setUint8(4, 99);

            assert.throws(function () {
                accessors.readSlot(0);
            }, /^Error: Unknown spinner slot state byte 99$/u);
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

            assert.throws(function () {
                accessors.readSlot(0);
            }, /^Error: Failed to read a stable spinner slot snapshot$/u);
            assert.strictEqual(atomics.loadCallCount, 1025);
        });

        test('writeSlot stores labels at the full label capacity without truncating the message', function () {
            const accessors = createAccessors(1);
            const label = 'x'.repeat(64);

            accessors.writeSlot(0, 'running', label, 'message');

            assert.deepStrictEqual(accessors.readSlot(0), { state: 'running', label, message: 'message' });
        });

        test('writeSlot stores messages at the full message capacity', function () {
            const accessors = createAccessors(1);
            const message = 'x'.repeat(256);

            accessors.writeSlot(0, 'running', 'label', message);

            assert.deepStrictEqual(accessors.readSlot(0), { state: 'running', label: 'label', message });
        });
    });

    suite('render acknowledgements', function () {
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
            const { atomics, getLoadCount } = createRenderedMutationLoadCounter('timed-out');
            const accessors = createAccessors(4, { now: createNow([ 100, 105, 110 ]), atomics });
            const mutation = accessors.markMutation();

            assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
            assert.strictEqual(atomics.waitCallCount, 1);
            assert.strictEqual(getLoadCount(), 2);
            assert.deepStrictEqual(atomics.waitCalls[0], [ 4, 0, 5 ]);
        });

        test('waitForRenderedMutation stops after one wait when the deadline is reached exactly', function () {
            const { atomics, getLoadCount } = createRenderedMutationLoadCounter('ok');
            const accessors = createAccessors(4, { now: createNow([ 100, 100, 110 ]), atomics });
            const mutation = accessors.markMutation();

            assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
            assert.strictEqual(atomics.waitCallCount, 1);
            assert.strictEqual(getLoadCount(), 2);
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

    suite('render polling', function () {
        test('waitForRenderedMutation keeps waiting after a timeout when the rendered mutation still makes progress', function () {
            const { atomics, result } = runWaitScenario({
                now: [ 100, 100, 101, 101, 102 ],
                renderedMutations: [ 0, 1, 1 ],
                waitResults: [ 'timed-out', 'ok' ],
                targetOffset: 1
            });

            assert.strictEqual(result, true);
            assert.strictEqual(atomics.waitCallCount, 2);
            assert.deepStrictEqual(atomics.waitCalls[0], [ 4, 0, 10 ]);
            assert.deepStrictEqual(atomics.waitCalls[1], [ 4, 1, 9 ]);
        });

        test('waitForRenderedMutation returns false after a timeout when the rendered mutation made no progress', function () {
            const { atomics, result } = runWaitScenario({
                now: [ 100, 100, 101 ],
                renderedMutations: [ 0, 0 ],
                waitResults: [ 'timed-out' ],
                targetOffset: 1
            });

            assert.strictEqual(result, false);
            assert.strictEqual(atomics.waitCallCount, 1);
            assert.deepStrictEqual(atomics.waitCalls[0], [ 4, 0, 10 ]);
        });

        test('waitForRenderedMutation continues after progress when the remaining timeout grows', function () {
            const { atomics, result } = runWaitScenario({
                now: [ 100, 100, 95, 95 ],
                renderedMutations: [ 0, 1, 3 ],
                targetOffset: 2
            });

            assert.strictEqual(result, true);
            assert.strictEqual(atomics.waitCallCount, 1);
        });

        test('waitForRenderedMutation returns false when the remaining timeout grows without render progress', function () {
            const { atomics, getLoadCount } = createRenderedMutationLoadCounter('ok');
            const accessors = createAccessors(4, { now: createNow([ 100, 105, 90 ]), atomics });
            const mutation = accessors.markMutation();

            assert.strictEqual(accessors.waitForRenderedMutation(mutation, 10), false);
            assert.strictEqual(atomics.waitCallCount, 1);
            assert.strictEqual(getLoadCount(), 2);
        });

        test('waitForRenderedMutation uses the final poll result after exhausting the attempt budget', function () {
            let loadCount = 0;
            const atomics = createControlledAtomics({
                load(typedArray, index, realLoad) {
                    if (index === 4) {
                        loadCount += 1;
                        return 0;
                    }
                    return realLoad(typedArray, index);
                },
                wait() {
                    return 'ok';
                }
            });
            const accessors = createAccessors(4, { now: createNow([ 100 ]), atomics });
            const mutation = accessors.markMutation();

            assert.strictEqual(accessors.waitForRenderedMutation(mutation, 1000), false);
            assert.strictEqual(atomics.waitCallCount, 256);
            assert.strictEqual(loadCount, 513);
        });
    });
});
