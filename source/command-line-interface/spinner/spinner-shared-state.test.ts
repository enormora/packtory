import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';

type WaitResult = 'not-equal' | 'ok' | 'timed-out';

type AtomicsLike = {
    readonly add: (typedArray: Int32Array | Uint32Array, index: number, value: number) => number;
    readonly load: (typedArray: Int32Array | Uint32Array, index: number) => number;
    readonly notify: (typedArray: Int32Array, index: number, count?: number) => number;
    readonly store: (typedArray: Int32Array | Uint32Array, index: number, value: number) => number;
    readonly wait: (typedArray: Int32Array, index: number, value: number, timeout?: number) => WaitResult;
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

suite('spinner-shared-state basics and waits', function () {
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
