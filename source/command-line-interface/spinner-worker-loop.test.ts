import assert from 'node:assert';
import { test } from 'mocha';
import {
    createSpinnerSharedAccessors,
    createSpinnerSharedLayout,
    type SpinnerSharedAccessors
} from './spinner-shared-state.ts';
import {
    isSpinnerWorkerInput,
    startSpinnerWorker,
    type SpinnerWorkerDependencies,
    type SpinnerWorkerInput
} from './spinner-worker-loop.ts';

const escapeCodePoint = 27;
const escapeChar = String.fromCodePoint(escapeCodePoint);
const clearLineSequence = `${escapeChar}[2K\r`;
const successSymbolPattern = /✔/u;
const failureSymbolPattern = /✖/u;

function countOccurrences(haystack: string, needle: string): number {
    if (needle.length === 0) {
        return 0;
    }
    let count = 0;
    let position = haystack.indexOf(needle);
    while (position !== -1) {
        count += 1;
        position = haystack.indexOf(needle, position + needle.length);
    }
    return count;
}

function extractCursorUpLineCount(chunk: string): number | undefined {
    const prefix = `${escapeChar}[`;
    const start = chunk.indexOf(prefix);
    if (start === -1) {
        return undefined;
    }
    const remainder = chunk.slice(start + prefix.length);
    const end = remainder.indexOf('A');
    if (end === -1) {
        return undefined;
    }
    const digits = remainder.slice(0, end);
    if (!/^\d+$/u.test(digits)) {
        return undefined;
    }
    return Number.parseInt(digits, 10);
}

type Harness = {
    readonly accessors: SpinnerSharedAccessors;
    readonly tick: () => void;
    readonly writes: () => readonly string[];
    readonly clearIntervalCalls: () => readonly unknown[];
};

function buildInput(
    slotCount: number,
    stdoutFileDescriptor = 1
): {
    input: SpinnerWorkerInput;
    accessors: SpinnerSharedAccessors;
} {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    const accessors = createSpinnerSharedAccessors(buffer, layout);
    return { input: { buffer, slotCount, stdoutFileDescriptor }, accessors };
}

function createHarness(slotCount: number, stdoutFileDescriptor = 1): Harness {
    const { input, accessors } = buildInput(slotCount, stdoutFileDescriptor);
    const captured: { callback?: () => void } = {};
    const writes: string[] = [];
    const clearIntervalCalls: unknown[] = [];

    const dependencies: SpinnerWorkerDependencies<string> = {
        write: (fileDescriptor, chunk) => {
            assert.strictEqual(fileDescriptor, stdoutFileDescriptor);
            writes.push(chunk);
        },
        setInterval: (callback) => {
            captured.callback = callback;
            return 'ticker-handle';
        },
        clearInterval: (handle) => {
            clearIntervalCalls.push(handle);
        }
    };

    startSpinnerWorker(input, dependencies);

    return {
        accessors,
        tick: () => {
            if (captured.callback === undefined) {
                throw new Error('No interval callback was scheduled');
            }
            captured.callback();
        },
        writes: () => {
            return writes;
        },
        clearIntervalCalls: () => {
            return clearIntervalCalls;
        }
    };
}

test('startSpinnerWorker schedules the ticker with the interval stored in the shared buffer', () => {
    const { input, accessors } = buildInput(1);
    accessors.setIntervalMs(40);
    const captured: { ms?: number } = {};

    startSpinnerWorker(input, {
        write: () => {
            // noop
        },
        setInterval: (_callback, ms) => {
            captured.ms = ms;
            return 'ticker-handle';
        },
        clearInterval: () => {
            // noop
        }
    });

    assert.strictEqual(captured.ms, 40);
});

test('startSpinnerWorker writes the running slot label and message to the configured stdout file descriptor', () => {
    const harness = createHarness(2, 7);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'running', 'pkg', 'starting');

    harness.tick();

    const written = harness.writes().join('');
    assert.match(written, /pkg: starting/u);
});

test('startSpinnerWorker draws the success symbol for slots that have succeeded', () => {
    const harness = createHarness(1);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'succeeded', 'pkg', 'done');

    harness.tick();

    assert.match(harness.writes().join(''), successSymbolPattern);
});

test('startSpinnerWorker draws the failure symbol for failed slots', () => {
    const harness = createHarness(1);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'failed', 'pkg', 'oops');

    harness.tick();

    assert.match(harness.writes().join(''), failureSymbolPattern);
});

test('startSpinnerWorker draws the failure symbol for canceled slots', () => {
    const harness = createHarness(1);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'canceled', 'pkg', 'aborted');

    harness.tick();

    assert.match(harness.writes().join(''), failureSymbolPattern);
});

const expectedSpinnerFrames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

function extractGlyph(chunk: string): string {
    const marker = clearLineSequence;
    const start = chunk.lastIndexOf(marker);
    if (start === -1) {
        return '';
    }
    return chunk.charAt(start + marker.length);
}

function setupRunningSlotHarnessAndTick(): {
    readonly harness: ReturnType<typeof createHarness>;
    readonly written: string;
} {
    const harness = createHarness(1);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'running', 'pkg', 'msg');

    harness.tick();

    return { harness, written: harness.writes().join('') };
}

test('startSpinnerWorker draws a glyph from the spinner animation set for running slots', () => {
    const { written } = setupRunningSlotHarnessAndTick();
    const glyph = extractGlyph(written);
    assert.ok(expectedSpinnerFrames.includes(glyph), `Expected glyph to be a spinner frame, got "${glyph}"`);
});

test('startSpinnerWorker uses neither the success nor failure symbol while a slot is running', () => {
    const { written } = setupRunningSlotHarnessAndTick();
    assert.doesNotMatch(written, successSymbolPattern);
    assert.doesNotMatch(written, failureSymbolPattern);
});

test('startSpinnerWorker advances to a different spinner frame on the second tick', () => {
    const { harness } = setupRunningSlotHarnessAndTick();
    harness.tick();

    const writes = harness.writes();
    assert.strictEqual(writes.length, 2);
    const firstGlyph = extractGlyph(writes[0] ?? '');
    const secondGlyph = extractGlyph(writes[1] ?? '');
    assert.ok(
        expectedSpinnerFrames.includes(firstGlyph),
        `Expected first glyph to be a spinner frame, got "${firstGlyph}"`
    );
    assert.ok(
        expectedSpinnerFrames.includes(secondGlyph),
        `Expected second glyph to be a spinner frame, got "${secondGlyph}"`
    );
    assert.notStrictEqual(firstGlyph, secondGlyph);
});

test('startSpinnerWorker truncates lines that would exceed the configured column width', () => {
    const harness = createHarness(1);
    harness.accessors.setColumns(8);
    harness.accessors.writeSlot(0, 'succeeded', 'long-label', 'long-message');

    harness.tick();

    const lines = harness
        .writes()
        .join('')
        .split('\n')
        .filter((line) => {
            return line.length > 0;
        });
    for (const line of lines) {
        const stripped = line.split(clearLineSequence).join('');
        assert.ok(stripped.length <= 8, `Expected line to be truncated to 8 columns, got ${stripped.length}`);
    }
});

test('startSpinnerWorker leaves a line untruncated when columns is configured as zero', () => {
    const harness = createHarness(1);
    harness.accessors.setColumns(0);
    harness.accessors.writeSlot(0, 'succeeded', 'lbl', 'message');

    harness.tick();

    assert.match(harness.writes().join(''), /lbl: message/u);
});

test('startSpinnerWorker draws one line per active slot up to the highest active index', () => {
    const harness = createHarness(4);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'running', 'a', 'one');
    harness.accessors.writeSlot(2, 'running', 'c', 'three');

    harness.tick();

    const occurrences = countOccurrences(harness.writes().join(''), clearLineSequence);
    assert.strictEqual(occurrences, 3);
});

test('startSpinnerWorker skips writing to stdout while there is nothing to render', () => {
    const harness = createHarness(2);

    harness.tick();

    assert.strictEqual(harness.writes().length, 0);
});

test('startSpinnerWorker rewinds the cursor up by the previously rendered line count before redrawing', () => {
    const { harness } = setupRunningSlotHarnessAndTick();
    harness.tick();

    const lastChunk = harness.writes().at(-1) ?? '';
    assert.strictEqual(extractCursorUpLineCount(lastChunk), 1);
});

test('startSpinnerWorker keeps refreshing the rendered block once a slot was drawn even if it goes empty', () => {
    const harness = createHarness(1);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'running', 'pkg', 'msg');

    harness.tick();
    harness.accessors.setSlotEmpty(0);
    harness.tick();

    assert.strictEqual(harness.writes().length, 2);
});

test('startSpinnerWorker writes a final tick and clears the interval after a shutdown was requested', () => {
    const harness = createHarness(1);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'running', 'pkg', 'msg');

    harness.tick();
    harness.accessors.requestShutdown();
    harness.tick();

    assert.strictEqual(harness.clearIntervalCalls().length, 1);
    assert.strictEqual(harness.clearIntervalCalls()[0], 'ticker-handle');
});

test('isSpinnerWorkerInput accepts a well-formed payload', () => {
    const layout = createSpinnerSharedLayout(1);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);

    assert.strictEqual(isSpinnerWorkerInput({ buffer, slotCount: 1, stdoutFileDescriptor: 1 }), true);
});

test('isSpinnerWorkerInput rejects non-objects', () => {
    assert.strictEqual(isSpinnerWorkerInput(null), false);
    assert.strictEqual(isSpinnerWorkerInput('not-an-object'), false);
});

test('isSpinnerWorkerInput rejects payloads with a buffer that is not a SharedArrayBuffer', () => {
    assert.strictEqual(
        isSpinnerWorkerInput({ buffer: new ArrayBuffer(8), slotCount: 1, stdoutFileDescriptor: 1 }),
        false
    );
});

test('isSpinnerWorkerInput rejects payloads with a non-numeric slotCount', () => {
    const layout = createSpinnerSharedLayout(1);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);

    assert.strictEqual(isSpinnerWorkerInput({ buffer, slotCount: '1', stdoutFileDescriptor: 1 }), false);
});

test('isSpinnerWorkerInput rejects payloads with a non-numeric stdoutFileDescriptor', () => {
    const layout = createSpinnerSharedLayout(1);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);

    assert.strictEqual(isSpinnerWorkerInput({ buffer, slotCount: 1, stdoutFileDescriptor: '1' }), false);
});
