import assert from 'node:assert/strict';
import { performance as currentPerformance } from 'node:perf_hooks';
import { setImmediate as scheduleImmediate } from 'node:timers';
import { stripVTControlCharacters } from 'node:util';

const spinnerFramePercentile = 0.99;
const spinnerFrames = new Set([ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ]);
const packageNameCaptureIndex = 2;
const spinnerGlyphCaptureIndex = 1;

type SpinnerGlyphState = {
    readonly previousGlyphByPackage: ReadonlyMap<string, string>;
    readonly pendingFramePackages: ReadonlySet<string>;
};

type SpinnerFrameCollection = SpinnerGlyphState & {
    readonly matchedSpinnerLine: boolean;
};

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

    const sortedValues = Array.from(values).toSorted(function (left, right) {
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
    previousGlyphByPackage: ReadonlyMap<string, string>,
    pendingFramePackages: ReadonlySet<string>
): SpinnerGlyphState {
    const previousGlyph = previousGlyphByPackage.get(packageName);

    if (previousGlyph === glyph || !spinnerFrames.has(glyph)) {
        return { previousGlyphByPackage, pendingFramePackages };
    }

    return {
        previousGlyphByPackage: new Map([ ...previousGlyphByPackage, [ packageName, glyph ] ]),
        pendingFramePackages: new Set([ ...pendingFramePackages, packageName ])
    };
}

function collectSpinnerFramePackage(match: RegExpMatchArray, state: SpinnerGlyphState): SpinnerGlyphState {
    const glyph = match[spinnerGlyphCaptureIndex];
    const packageName = match[packageNameCaptureIndex];

    if (glyph === undefined || packageName === undefined) {
        return state;
    }

    return recordSpinnerGlyphChange(
        packageName,
        glyph,
        state.previousGlyphByPackage,
        state.pendingFramePackages
    );
}

function collectSpinnerFramePackages(
    visibleText: string,
    spinnerLinePattern: RegExp,
    glyphState: SpinnerGlyphState
): SpinnerFrameCollection {
    let collection: SpinnerFrameCollection = { ...glyphState, matchedSpinnerLine: false };

    for (const match of visibleText.matchAll(spinnerLinePattern)) {
        const glyph = match[spinnerGlyphCaptureIndex];
        const packageName = match[packageNameCaptureIndex];

        collection = {
            ...collectSpinnerFramePackage(match, collection),
            matchedSpinnerLine: glyph !== undefined && packageName !== undefined
        };
    }

    return collection;
}

type FrameRecorderState = {
    readonly allFrameGaps: readonly number[];
    readonly perPackageFrameGaps: ReadonlyMap<string, readonly number[]>;
    readonly lastTimestampByPackage: ReadonlyMap<string, number>;
    readonly previousGlyphByPackage: ReadonlyMap<string, string>;
    readonly pendingFramePackages: ReadonlySet<string>;
    readonly spinnerLinePattern: RegExp;
    readonly lastFlushAtMs: number | undefined;
    readonly pendingFlush: boolean;
    readonly frameCount: number;
};

type PackageFrameGapState = {
    readonly perPackageFrameGaps: ReadonlyMap<string, readonly number[]>;
    readonly lastTimestampByPackage: ReadonlyMap<string, number>;
};

function createFrameRecorderState(packageNames: readonly string[]): FrameRecorderState {
    return {
        allFrameGaps: [],
        perPackageFrameGaps: new Map<string, readonly number[]>(
            packageNames.map(function (packageName) {
                return [ packageName, [] ] as const;
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

function updatePackageFrameGaps(state: FrameRecorderState, timestamp: number): PackageFrameGapState {
    let { perPackageFrameGaps, lastTimestampByPackage } = state;

    for (const packageName of state.pendingFramePackages) {
        const [ gaps, previous ] = [
            state.perPackageFrameGaps.get(packageName),
            state.lastTimestampByPackage.get(packageName)
        ];

        if (gaps !== undefined && previous !== undefined) {
            perPackageFrameGaps = new Map([
                ...perPackageFrameGaps,
                [ packageName, [ ...gaps, timestamp - previous ] ]
            ]);
        }
        lastTimestampByPackage = new Map([ ...lastTimestampByPackage, [ packageName, timestamp ] ]);
    }

    return { perPackageFrameGaps, lastTimestampByPackage };
}

export function createFrameRecorder(packageNames: readonly string[]): FrameRecorder {
    let state = createFrameRecorderState(packageNames);

    function flushPending(): void {
        if (state.pendingFramePackages.size === 0) {
            return;
        }

        const timestamp = currentPerformance.now();
        const frameGap = state.lastFlushAtMs === undefined ? [] : [ timestamp - state.lastFlushAtMs ];
        const { perPackageFrameGaps, lastTimestampByPackage } = updatePackageFrameGaps(state, timestamp);

        state = {
            ...state,
            allFrameGaps: [ ...state.allFrameGaps, ...frameGap ],
            perPackageFrameGaps,
            lastTimestampByPackage,
            pendingFramePackages: new Set<string>(),
            lastFlushAtMs: timestamp,
            frameCount: state.frameCount + 1
        };
    }

    return {
        recordWrite(data) {
            const visibleText = stripVTControlCharacters(data);
            if (visibleText === '') {
                return;
            }

            const collectedFramePackages = collectSpinnerFramePackages(
                visibleText,
                state.spinnerLinePattern,
                {
                    previousGlyphByPackage: state.previousGlyphByPackage,
                    pendingFramePackages: state.pendingFramePackages
                }
            );
            state = {
                ...state,
                previousGlyphByPackage: collectedFramePackages.previousGlyphByPackage,
                pendingFramePackages: collectedFramePackages.pendingFramePackages
            };

            if (!collectedFramePackages.matchedSpinnerLine || state.pendingFlush) {
                return;
            }

            state = { ...state, pendingFlush: true };
            scheduleImmediate(function () {
                flushPending();
                state = { ...state, pendingFlush: false };
            });
        },
        async finish() {
            if (state.pendingFlush) {
                await new Promise<void>(function (resolve) {
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

    perPackageFrameGaps.forEach(function (gaps) {
        if (gaps.length === 0) {
            return;
        }

        worstP99FrameGapMs = Math.max(worstP99FrameGapMs, calculatePercentile(gaps, spinnerFramePercentile));
        worstMaxFrameGapMs = Math.max(worstMaxFrameGapMs, ...gaps);
    });

    return {
        p99FrameGapMs: worstP99FrameGapMs,
        maxFrameGapMs: worstMaxFrameGapMs
    };
}
