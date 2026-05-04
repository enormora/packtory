/* eslint-disable complexity, @typescript-eslint/no-shadow, sonarjs/file-permissions, @typescript-eslint/no-magic-numbers, @typescript-eslint/no-unsafe-assignment, node/no-process-env, node/prefer-global/timers, destructuring/in-params, max-statements -- CLI responsiveness benchmarking requires direct PTY and process control. */

import path from 'node:path';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { stripVTControlCharacters } from 'node:util';
import * as nodePty from 'node-pty';
import type { CliResponsivenessMeasurement, CliWorkloadSize, WorkloadsFile } from './benchmark-types.ts';
import {
    assert,
    calculatePercentile,
    createTemporaryDirectory,
    removeDirectory,
    runTinybenchTask
} from './benchmark-helpers.ts';
import { startBenchmarkRegistry } from './benchmark-registry.ts';
import { generateCliWorkload } from './generate-workload.ts';

const cliEntryPointPath = path.join(
    process.cwd(),
    'source/packages/command-line-interface/command-line-interface.entry-point.ts'
);

async function ensureNodePtyHelperIsExecutable(): Promise<void> {
    const helperPath = path.join(
        process.cwd(),
        'node_modules/node-pty/prebuilds',
        `${process.platform}-${process.arch}`,
        'spawn-helper'
    );

    try {
        await fs.chmod(helperPath, 0o755);
    } catch (error: unknown) {
        const errorCode = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;

        if (errorCode !== 'ENOENT') {
            throw error;
        }
    }
}

function createPtyEnvironment(): Record<string, string> {
    const environmentEntries = Object.entries({
        ...process.env,
        CI: '',
        TERM: 'xterm-256color',
        FORCE_COLOR: '0'
    }).filter(([, value]) => {
        return typeof value === 'string';
    });

    return Object.fromEntries(environmentEntries);
}

const spinnerFrames = new Set(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']);

type FrameRecorder = {
    recordWrite: (data: string) => void;
    finish: () => Promise<{
        readonly allFrameGapTimestamps: readonly number[];
        readonly perPackageFrameGapTimestamps: ReadonlyMap<string, readonly number[]>;
    }>;
};

function createFrameRecorder(packageNames: readonly string[]): FrameRecorder {
    const allFrameGapTimestamps: number[] = [];
    const perPackageFrameGapTimestamps = new Map(
        packageNames.map((packageName) => {
            return [packageName, [] as number[]] as const;
        })
    );
    const previousGlyphByPackage = new Map<string, string>();
    const pendingFramePackages = new Set<string>();
    const escapedPackageNames = packageNames.map((packageName) => {
        return packageName.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&');
    });
    const packagePattern = escapedPackageNames.join('|');
    const framePattern = Array.from(spinnerFrames).join('');
    const spinnerLinePattern = new RegExp(`([${framePattern}]) (${packagePattern}): `, 'gu');
    let pendingFlush = false;

    function flushPendingPackages(): void {
        const timestamp = performance.now();

        if (pendingFramePackages.size === 0) {
            pendingFlush = false;
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
        pendingFlush = false;
    }

    return {
        recordWrite(data) {
            const visibleText = stripVTControlCharacters(data);
            if (visibleText === '') {
                return;
            }

            spinnerLinePattern.lastIndex = 0;
            let matchedSpinnerLine = false;
            let match = spinnerLinePattern.exec(visibleText);

            while (match !== null) {
                matchedSpinnerLine = true;
                const glyph = match[1];
                const packageName = match[2];

                if (glyph !== undefined && packageName !== undefined) {
                    const previousGlyph = previousGlyphByPackage.get(packageName);

                    if (spinnerFrames.has(glyph) && previousGlyph !== glyph) {
                        previousGlyphByPackage.set(packageName, glyph);
                        pendingFramePackages.add(packageName);
                    }
                }

                match = spinnerLinePattern.exec(visibleText);
            }

            if (!matchedSpinnerLine || pendingFlush) {
                return;
            }

            pendingFlush = true;
            setImmediate(() => {
                flushPendingPackages();
            });
        },
        async finish() {
            if (pendingFlush) {
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }

            return {
                allFrameGapTimestamps,
                perPackageFrameGapTimestamps
            };
        }
    };
}

function calculateFrameGaps(timestamps: readonly number[]): readonly number[] {
    const frameGaps: number[] = [];

    for (let index = 1; index < timestamps.length; index += 1) {
        const currentTimestamp = timestamps[index];
        const previousTimestamp = timestamps[index - 1];

        if (currentTimestamp === undefined || previousTimestamp === undefined) {
            throw new Error(`Expected timestamps for frame gap index ${index}`);
        }

        frameGaps.push(currentTimestamp - previousTimestamp);
    }

    return frameGaps;
}

function collectWorstPerPackageGapMetrics(perPackageFrameGapTimestamps: ReadonlyMap<string, readonly number[]>): {
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

        worstP99FrameGapMs = Math.max(worstP99FrameGapMs, calculatePercentile(gaps, 0.99));
        worstMaxFrameGapMs = Math.max(worstMaxFrameGapMs, Math.max(...gaps));
    });

    return {
        p99FrameGapMs: worstP99FrameGapMs,
        maxFrameGapMs: worstMaxFrameGapMs
    };
}

async function runCliPublish(
    workingDirectory: string,
    packageNames: readonly string[]
): Promise<{
    runtimeMs: number;
    allFrameGapTimestamps: readonly number[];
    perPackageFrameGapTimestamps: ReadonlyMap<string, readonly number[]>;
    frameCount: number;
}> {
    return new Promise((resolve, reject) => {
        const outputChunks: string[] = [];
        const frameRecorder = createFrameRecorder(packageNames);
        const startedAt = performance.now();
        const pty = nodePty.spawn(
            process.execPath,
            ['--experimental-strip-types', '--enable-source-maps', cliEntryPointPath, 'publish'],
            {
                cols: 120,
                rows: 40,
                cwd: workingDirectory,
                env: createPtyEnvironment(),
                name: 'xterm-color'
            }
        );

        pty.onData((data) => {
            outputChunks.push(data);
            frameRecorder.recordWrite(data);
        });

        pty.onExit(async ({ exitCode, signal }) => {
            const recordedFrames = await frameRecorder.finish();
            const runtimeMs = performance.now() - startedAt;
            const outputTail = outputChunks.join('').slice(-4000);

            if (exitCode !== 0) {
                reject(
                    new Error(
                        `CLI benchmark failed with exit code ${exitCode}, signal ${signal ?? 'none'}.\n${outputTail}`
                    )
                );
                return;
            }

            resolve({
                runtimeMs,
                allFrameGapTimestamps: recordedFrames.allFrameGapTimestamps,
                perPackageFrameGapTimestamps: recordedFrames.perPackageFrameGapTimestamps,
                frameCount: recordedFrames.allFrameGapTimestamps.length
            });
        });
    });
}

export async function runCliResponsivenessBenchmark(
    size: CliWorkloadSize,
    workloads: WorkloadsFile
): Promise<CliResponsivenessMeasurement> {
    const rootDirectory = await createTemporaryDirectory(`packtory-benchmark-cli-${size}-`);
    const registry = await startBenchmarkRegistry();

    try {
        await ensureNodePtyHelperIsExecutable();
        const workload = await generateCliWorkload({ rootDirectory, size, workloads });
        await fs.writeFile(
            path.join(rootDirectory, 'packtory.config.js'),
            workload.createConfigModuleText(registry.settings)
        );

        const measuredFrameGaps: number[] = [];
        const measuredPerPackageFrameTimestamps = new Map<string, number[]>(
            workload.packageNames.map((packageName) => {
                return [packageName, []] as const;
            })
        );
        let latestFrameCount = 0;
        const result = await runTinybenchTask(`publish-cli:${size}`, async () => {
            const measurement = await runCliPublish(rootDirectory, workload.packageNames);

            measuredFrameGaps.push(...calculateFrameGaps(measurement.allFrameGapTimestamps));
            measurement.perPackageFrameGapTimestamps.forEach((timestamps, packageName) => {
                const packageTimestamps = measuredPerPackageFrameTimestamps.get(packageName);

                if (packageTimestamps !== undefined) {
                    packageTimestamps.push(...timestamps);
                }
            });
            latestFrameCount = measurement.frameCount;
        });

        assert(measuredFrameGaps.length > 0, `CLI benchmark for "${size}" did not record any frame gaps`);
        const worstPerPackageGaps = collectWorstPerPackageGapMetrics(measuredPerPackageFrameTimestamps);

        return {
            benchmarkName: 'publish-cli',
            size,
            frameCount: latestFrameCount,
            p99FrameGapMs: worstPerPackageGaps.p99FrameGapMs,
            maxFrameGapMs: worstPerPackageGaps.maxFrameGapMs,
            ...result
        };
    } finally {
        await registry.close();
        await removeDirectory(rootDirectory);
    }
}
