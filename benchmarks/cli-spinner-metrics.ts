import assert from 'node:assert/strict';
import { performance as currentPerformance } from 'node:perf_hooks';
import { setImmediate as scheduleImmediate } from 'node:timers';
import { stripVTControlCharacters } from 'node:util';

const spinnerFramePercentile = 0.99;
const spinnerFrames = new Set(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']);
const packageNameCaptureIndex = 2;
const spinnerGlyphCaptureIndex = 1;

export type FrameRecorderResult = {
    readonly allFrameGaps: readonly number[];
    readonly perPackageFrameGaps: ReadonlyMap<string, readonly number[]>;
    readonly frameCount: number;
};

export type FrameRecorder = {
    recordWrite: (data: string) => void;
    finish: () => Promise<FrameRecorderResult>;
};

function escapePackageName(packageName: string): string {
    return packageName.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&');
}

function calculatePercentile(values: readonly number[], percentile: number): number {
    assert.ok(values.length > 0, 'Cannot calculate a percentile from an empty value list');
    assert.ok(percentile >= 0 && percentile <= 1, `Percentile must be between 0 and 1, received "${percentile}"`);

    const sortedValues = Array.from(values).toSorted((left, right) => {
        return left - right;
    });
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    const normalizedIndex = Math.min(sortedValues.length - 1, Math.max(0, index));
    const value = sortedValues[normalizedIndex];

    assert.ok(value !== undefined, 'Expected percentile calculation to produce a value');
    return value;
}

function createSpinnerLinePattern(packageNames: readonly string[]): RegExp {
    const packagePattern = packageNames.map(escapePackageName).join('|');
    const framePattern = Array.from(spinnerFrames).join('');
    return new RegExp(`([${framePattern}]) (${packagePattern}): `, 'gu');
}

function recordSpinnerGlyphChange(
    packageName: string,
    glyph: string,
    previousGlyphByPackage: Map<string, string>,
    pendingFramePackages: Set<string>
): void {
    const previousGlyph = previousGlyphByPackage.get(packageName);

    if (!spinnerFrames.has(glyph) || previousGlyph === glyph) {
        return;
    }

    previousGlyphByPackage.set(packageName, glyph);
    pendingFramePackages.add(packageName);
}

function collectSpinnerFramePackages(
    visibleText: string,
    spinnerLinePattern: RegExp,
    previousGlyphByPackage: Map<string, string>,
    pendingFramePackages: Set<string>
): boolean {
    let matchedSpinnerLine = false;

    for (const match of visibleText.matchAll(spinnerLinePattern)) {
        matchedSpinnerLine = true;
        const glyph = match[spinnerGlyphCaptureIndex];
        const packageName = match[packageNameCaptureIndex];

        if (glyph !== undefined && packageName !== undefined) {
            recordSpinnerGlyphChange(packageName, glyph, previousGlyphByPackage, pendingFramePackages);
        }
    }

    return matchedSpinnerLine;
}

type FrameRecorderState = {
    readonly allFrameGaps: number[];
    readonly perPackageFrameGaps: Map<string, number[]>;
    readonly lastTimestampByPackage: Map<string, number>;
    readonly previousGlyphByPackage: Map<string, string>;
    readonly pendingFramePackages: Set<string>;
    readonly spinnerLinePattern: RegExp;
    lastFlushAtMs: number | undefined;
    pendingFlush: boolean;
    frameCount: number;
};

function createFrameRecorderState(packageNames: readonly string[]): FrameRecorderState {
    return {
        allFrameGaps: [],
        perPackageFrameGaps: new Map(
            packageNames.map((packageName) => {
                return [packageName, [] as number[]] as const;
            })
        ),
        lastTimestampByPackage: new Map<string, number>(),
        previousGlyphByPackage: new Map<string, string>(),
        pendingFramePackages: new Set<string>(),
        spinnerLinePattern: createSpinnerLinePattern(packageNames),
        lastFlushAtMs: undefined,
        pendingFlush: false,
        frameCount: 0
    };
}

export function createFrameRecorder(packageNames: readonly string[]): FrameRecorder {
    const state = createFrameRecorderState(packageNames);

    function flushPending(): void {
        if (state.pendingFramePackages.size === 0) {
            return;
        }

        const timestamp = currentPerformance.now();

        if (state.lastFlushAtMs !== undefined) {
            state.allFrameGaps.push(timestamp - state.lastFlushAtMs);
        }
        state.lastFlushAtMs = timestamp;
        state.frameCount += 1;

        state.pendingFramePackages.forEach((packageName) => {
            const gaps = state.perPackageFrameGaps.get(packageName);
            const previous = state.lastTimestampByPackage.get(packageName);

            if (gaps !== undefined && previous !== undefined) {
                gaps.push(timestamp - previous);
            }
            state.lastTimestampByPackage.set(packageName, timestamp);
        });
        state.pendingFramePackages.clear();
    }

    return {
        recordWrite(data) {
            const visibleText = stripVTControlCharacters(data);
            if (visibleText === '') {
                return;
            }

            const matchedSpinnerLine = collectSpinnerFramePackages(
                visibleText,
                state.spinnerLinePattern,
                state.previousGlyphByPackage,
                state.pendingFramePackages
            );

            if (!matchedSpinnerLine || state.pendingFlush) {
                return;
            }

            state.pendingFlush = true;
            scheduleImmediate(() => {
                flushPending();
                state.pendingFlush = false;
            });
        },
        async finish() {
            if (state.pendingFlush) {
                await new Promise<void>((resolve) => {
                    scheduleImmediate(resolve);
                });
            }

            return {
                allFrameGaps: state.allFrameGaps,
                perPackageFrameGaps: state.perPackageFrameGaps,
                frameCount: state.frameCount
            };
        }
    };
}

export type WorstPerPackageGapMetrics = {
    readonly p99FrameGapMs: number;
    readonly maxFrameGapMs: number;
};

export function summarizeWorstPerPackageGaps(
    perPackageFrameGaps: ReadonlyMap<string, readonly number[]>
): WorstPerPackageGapMetrics {
    let worstP99FrameGapMs = 0;
    let worstMaxFrameGapMs = 0;

    perPackageFrameGaps.forEach((gaps) => {
        if (gaps.length === 0) {
            return;
        }

        worstP99FrameGapMs = Math.max(worstP99FrameGapMs, calculatePercentile(gaps, spinnerFramePercentile));
        worstMaxFrameGapMs = Math.max(worstMaxFrameGapMs, Math.max(...gaps));
    });

    return {
        p99FrameGapMs: worstP99FrameGapMs,
        maxFrameGapMs: worstMaxFrameGapMs
    };
}
