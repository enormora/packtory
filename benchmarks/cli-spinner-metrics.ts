import assert from 'node:assert/strict';
import { performance as currentPerformance } from 'node:perf_hooks';
import { setImmediate as scheduleImmediate } from 'node:timers';
import { stripVTControlCharacters } from 'node:util';

const spinnerFramePercentile = 0.99;
const spinnerFrames = new Set(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']);
const packageNameCaptureIndex = 2;
const spinnerGlyphCaptureIndex = 1;

export type FrameRecorder = {
    recordWrite: (data: string) => void;
    finish: () => Promise<{
        readonly allFrameGapTimestamps: readonly number[];
        readonly perPackageFrameGapTimestamps: ReadonlyMap<string, readonly number[]>;
    }>;
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

function flushPendingPackages(
    allFrameGapTimestamps: number[],
    perPackageFrameGapTimestamps: Map<string, number[]>,
    pendingFramePackages: Set<string>
): void {
    const timestamp = currentPerformance.now();

    if (pendingFramePackages.size === 0) {
        return;
    }

    allFrameGapTimestamps.push(timestamp);
    pendingFramePackages.forEach((packageName) => {
        const packageTimestamps = perPackageFrameGapTimestamps.get(packageName);

        if (packageTimestamps !== undefined) {
            packageTimestamps.push(timestamp);
        }
    });
    pendingFramePackages.clear();
}

export function createFrameRecorder(packageNames: readonly string[]): FrameRecorder {
    const allFrameGapTimestamps: number[] = [];
    const perPackageFrameGapTimestamps = new Map(
        packageNames.map((packageName) => {
            return [packageName, [] as number[]] as const;
        })
    );
    const previousGlyphByPackage = new Map<string, string>();
    const pendingFramePackages = new Set<string>();
    const spinnerLinePattern = createSpinnerLinePattern(packageNames);
    let pendingFlush = false;

    return {
        recordWrite(data) {
            const visibleText = stripVTControlCharacters(data);
            if (visibleText === '') {
                return;
            }

            const matchedSpinnerLine = collectSpinnerFramePackages(
                visibleText,
                spinnerLinePattern,
                previousGlyphByPackage,
                pendingFramePackages
            );

            if (!matchedSpinnerLine || pendingFlush) {
                return;
            }

            pendingFlush = true;
            scheduleImmediate(() => {
                flushPendingPackages(allFrameGapTimestamps, perPackageFrameGapTimestamps, pendingFramePackages);
                pendingFlush = false;
            });
        },
        async finish() {
            if (pendingFlush) {
                await new Promise<void>((resolve) => {
                    scheduleImmediate(resolve);
                });
            }

            return {
                allFrameGapTimestamps,
                perPackageFrameGapTimestamps
            };
        }
    };
}

export function calculateFrameGaps(timestamps: readonly number[]): readonly number[] {
    const frameGaps: number[] = [];

    for (let index = 1; index < timestamps.length; index += 1) {
        const currentTimestamp = timestamps[index];
        const previousTimestamp = timestamps[index - 1];

        assert.ok(
            currentTimestamp !== undefined && previousTimestamp !== undefined,
            `Expected timestamps for frame gap index ${index}`
        );
        frameGaps.push(currentTimestamp - previousTimestamp);
    }

    return frameGaps;
}

export function collectWorstPerPackageGapMetrics(
    perPackageFrameGapTimestamps: ReadonlyMap<string, readonly number[]>
): {
    readonly p99FrameGapMs: number;
    readonly maxFrameGapMs: number;
} {
    let worstP99FrameGapMs = 0;
    let worstMaxFrameGapMs = 0;

    perPackageFrameGapTimestamps.forEach((timestamps) => {
        const gaps = calculateFrameGaps(timestamps);
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
