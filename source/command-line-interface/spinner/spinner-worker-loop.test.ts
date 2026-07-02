import assert from 'node:assert';
import { suite, test } from 'mocha';
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
const cursorUpLineCountPattern = /\[(?<lineCount>\d+)A/u;

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
    const digits = cursorUpLineCountPattern.exec(chunk)?.groups?.lineCount;
    return digits === undefined ? undefined : Number.parseInt(digits, 10);
}

type Harness = {
    readonly accessors: SpinnerSharedAccessors;
    readonly tick: () => void;
    readonly writes: () => readonly string[];
    readonly clearIntervalCalls: () => readonly unknown[];
};
type WorkerInputFixture = {
    readonly input: SpinnerWorkerInput;
    readonly accessors: SpinnerSharedAccessors;
};
type CapturedInterval = {
    callback?: () => void;
};
type RunningSlotHarness = {
    readonly harness: Harness;
    readonly written: string;
};
type ShutdownHarness = {
    readonly harness: Harness;
    readonly runningMutation: number;
    readonly shutdownMutation: number;
};

function noop(): void {
    return undefined;
}

function buildInput(
    slotCount: number,
    stdoutFileDescriptor = 1
): WorkerInputFixture {
    const layout = createSpinnerSharedLayout(slotCount);
    const buffer = new SharedArrayBuffer(layout.bufferByteLength);
    const accessors = createSpinnerSharedAccessors(buffer, layout);
    return { input: { buffer, slotCount, stdoutFileDescriptor }, accessors };
}

function createHarness(slotCount: number, stdoutFileDescriptor = 1): Harness {
    const { input, accessors } = buildInput(slotCount, stdoutFileDescriptor);
    const captured: CapturedInterval = {};
    const writes: string[] = [];
    const clearIntervalCalls: unknown[] = [];

    const dependencies: SpinnerWorkerDependencies<string> = {
        write(fileDescriptor, chunk) {
            assert.strictEqual(fileDescriptor, stdoutFileDescriptor);
            writes.push(chunk);
        },
        setInterval(callback) {
            captured.callback = callback;
            return 'ticker-handle';
        },
        clearInterval(handle) {
            clearIntervalCalls.push(handle);
        }
    };

    startSpinnerWorker(input, dependencies);

    return {
        accessors,
        tick() {
            if (captured.callback === undefined) {
                throw new Error('No interval callback was scheduled');
            }
            captured.callback();
        },
        writes() {
            return writes;
        },
        clearIntervalCalls() {
            return clearIntervalCalls;
        }
    };
}

const expectedSpinnerFrames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

function extractGlyph(chunk: string): string {
    const marker = clearLineSequence;
    const start = chunk.lastIndexOf(marker);
    if (start === -1) {
        return '';
    }
    return chunk.charAt(start + marker.length);
}

function setupRunningSlotHarnessAndTick(): RunningSlotHarness {
    const harness = createHarness(1);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'running', 'pkg', 'msg');

    harness.tick();

    return { harness, written: harness.writes().join('') };
}

function setupShutdownHarness(): ShutdownHarness {
    const harness = createHarness(1);
    harness.accessors.setColumns(80);
    harness.accessors.writeSlot(0, 'running', 'pkg', 'msg');
    harness.accessors.bumpSlotGeneration(0);
    const runningMutation = harness.accessors.markMutation();

    harness.tick();
    harness.accessors.requestShutdown();
    const shutdownMutation = harness.accessors.markMutation();
    harness.tick();

    return { harness, runningMutation, shutdownMutation };
}

suite('spinner-worker-loop', function () {
    suite('startup and glyphs', function () {
        test('startSpinnerWorker schedules the ticker with the interval stored in the shared buffer', function () {
            const { input, accessors } = buildInput(1);
            accessors.setIntervalMs(40);
            let capturedMs: number | null = null;

            startSpinnerWorker(input, {
                write: noop,
                setInterval(_callback, ms) {
                    capturedMs = ms;
                    return 'ticker-handle';
                },
                clearInterval: noop
            });

            assert.strictEqual(capturedMs, 40);
        });

        test('startSpinnerWorker writes the running slot label and message to the configured stdout file descriptor', function () {
            const harness = createHarness(2, 7);
            harness.accessors.setColumns(80);
            harness.accessors.writeSlot(0, 'running', 'pkg', 'starting');

            harness.tick();

            const written = harness.writes().join('');
            assert.match(written, /pkg: starting/u);
        });

        test('startSpinnerWorker draws the success symbol for slots that have succeeded', function () {
            const harness = createHarness(1);
            harness.accessors.setColumns(80);
            harness.accessors.writeSlot(0, 'succeeded', 'pkg', 'done');

            harness.tick();

            assert.match(harness.writes().join(''), successSymbolPattern);
        });

        test('startSpinnerWorker draws the failure symbol for failed slots', function () {
            const harness = createHarness(1);
            harness.accessors.setColumns(80);
            harness.accessors.writeSlot(0, 'failed', 'pkg', 'oops');

            harness.tick();

            assert.match(harness.writes().join(''), failureSymbolPattern);
        });

        test('startSpinnerWorker draws the failure symbol for canceled slots', function () {
            const harness = createHarness(1);
            harness.accessors.setColumns(80);
            harness.accessors.writeSlot(0, 'canceled', 'pkg', 'aborted');

            harness.tick();

            assert.match(harness.writes().join(''), failureSymbolPattern);
        });

        test('startSpinnerWorker draws a glyph from the spinner animation set for running slots', function () {
            const { written } = setupRunningSlotHarnessAndTick();
            const glyph = extractGlyph(written);
            assert.ok(expectedSpinnerFrames.includes(glyph), `Expected glyph to be a spinner frame, got "${glyph}"`);
        });

        test('startSpinnerWorker uses neither the success nor failure symbol while a slot is running', function () {
            const { written } = setupRunningSlotHarnessAndTick();
            assert.doesNotMatch(written, successSymbolPattern);
            assert.doesNotMatch(written, failureSymbolPattern);
        });

        test('startSpinnerWorker advances to a different spinner frame on the second tick', function () {
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
    });

    suite('render output', function () {
        test('startSpinnerWorker truncates lines that would exceed the configured column width', function () {
            const harness = createHarness(1);
            harness.accessors.setColumns(8);
            harness.accessors.writeSlot(0, 'succeeded', 'long-label', 'long-message');

            harness.tick();

            const lines = harness
                .writes()
                .join('')
                .split('\n')
                .filter(function (line) {
                    return line.length > 0;
                });
            for (const line of lines) {
                const stripped = line.split(clearLineSequence).join('');
                assert.ok(stripped.length <= 8, `Expected line to be truncated to 8 columns, got ${stripped.length}`);
            }
        });

        test('startSpinnerWorker leaves a line untruncated when columns is configured as zero', function () {
            const harness = createHarness(1);
            harness.accessors.setColumns(0);
            harness.accessors.writeSlot(0, 'succeeded', 'lbl', 'message');

            harness.tick();

            assert.match(harness.writes().join(''), /lbl: message/u);
        });

        test('startSpinnerWorker draws one line per active slot up to the highest active index', function () {
            const harness = createHarness(4);
            harness.accessors.setColumns(80);
            harness.accessors.writeSlot(0, 'running', 'a', 'one');
            harness.accessors.writeSlot(2, 'running', 'c', 'three');

            harness.tick();

            const occurrences = countOccurrences(harness.writes().join(''), clearLineSequence);
            assert.strictEqual(occurrences, 3);
        });

        test('startSpinnerWorker skips writing to stdout while there is nothing to render', function () {
            const harness = createHarness(2);

            harness.tick();

            assert.strictEqual(harness.writes().length, 0);
        });

        test('startSpinnerWorker keeps render state valid after a tick with nothing to render', function () {
            const harness = createHarness(1);

            harness.tick();
            harness.accessors.setColumns(80);
            harness.accessors.writeSlot(0, 'running', 'pkg', 'starting');
            harness.tick();

            assert.match(harness.writes().join(''), /pkg: starting/u);
        });

        test('startSpinnerWorker acknowledges a pending mutation even when there is nothing to render', function () {
            const harness = createHarness(2);
            const mutation = harness.accessors.markMutation();

            harness.tick();

            assert.strictEqual(harness.writes().length, 0);
            assert.strictEqual(harness.accessors.waitForRenderedMutation(mutation, 1), true);
        });
    });

    suite('redraw and shutdown', function () {
        test('startSpinnerWorker rewinds the cursor up by the previously rendered line count before redrawing', function () {
            const { harness } = setupRunningSlotHarnessAndTick();
            harness.tick();

            const lastChunk = harness.writes().at(-1) ?? '';
            assert.strictEqual(extractCursorUpLineCount(lastChunk), 1);
        });

        test('startSpinnerWorker keeps refreshing the rendered block once a slot was drawn even if it goes empty', function () {
            const harness = createHarness(1);
            harness.accessors.setColumns(80);
            harness.accessors.writeSlot(0, 'running', 'pkg', 'msg');

            harness.tick();
            harness.accessors.writeSlot(0, 'empty', '', '');
            harness.tick();

            assert.strictEqual(harness.writes().length, 2);
        });

        test('startSpinnerWorker writes a final tick and clears the interval after a shutdown was requested', function () {
            const { harness, runningMutation, shutdownMutation } = setupShutdownHarness();

            assert.strictEqual(harness.clearIntervalCalls().length, 1);
            assert.strictEqual(harness.clearIntervalCalls()[0], 'ticker-handle');
            assert.strictEqual(harness.accessors.waitForRenderedMutation(runningMutation, 1), true);
            assert.strictEqual(harness.accessors.waitForRenderedMutation(shutdownMutation, 1), true);
        });
    });

    suite('input validation', function () {
        test('isSpinnerWorkerInput accepts a well-formed payload', function () {
            const layout = createSpinnerSharedLayout(1);
            const buffer = new SharedArrayBuffer(layout.bufferByteLength);

            assert.strictEqual(isSpinnerWorkerInput({ buffer, slotCount: 1, stdoutFileDescriptor: 1 }), true);
        });

        test('isSpinnerWorkerInput rejects non-objects', function () {
            assert.strictEqual(isSpinnerWorkerInput(null), false);
            assert.strictEqual(isSpinnerWorkerInput('not-an-object'), false);
        });

        test('isSpinnerWorkerInput rejects payloads with a buffer that is not a SharedArrayBuffer', function () {
            assert.strictEqual(
                isSpinnerWorkerInput({ buffer: new ArrayBuffer(8), slotCount: 1, stdoutFileDescriptor: 1 }),
                false
            );
        });

        test('isSpinnerWorkerInput rejects payloads with a non-numeric slotCount', function () {
            const layout = createSpinnerSharedLayout(1);
            const buffer = new SharedArrayBuffer(layout.bufferByteLength);

            assert.strictEqual(isSpinnerWorkerInput({ buffer, slotCount: '1', stdoutFileDescriptor: 1 }), false);
        });

        test('isSpinnerWorkerInput rejects payloads with a non-numeric stdoutFileDescriptor', function () {
            const layout = createSpinnerSharedLayout(1);
            const buffer = new SharedArrayBuffer(layout.bufferByteLength);

            assert.strictEqual(isSpinnerWorkerInput({ buffer, slotCount: 1, stdoutFileDescriptor: '1' }), false);
        });
    });
});
