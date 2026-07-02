import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { performance as currentPerformance } from 'node:perf_hooks';
import * as nodePty from 'node-pty';
import { createFrameRecorder, type FrameRecorder, type FrameRecorderResult } from './cli-spinner-metrics.ts';

const cliColumns = 120;
const cliRows = 40;
const cliOutputTailLength = 4000;
const executablePermissions = 0o700;
const cliEntryPointPath = path.join(
    process.cwd(),
    'source/packages/command-line-interface/command-line-interface.entry-point.ts'
);
const eventLoopProbePath = path.join(process.cwd(), 'benchmarks/cli-event-loop-probe.ts');

export type EventLoopProbeReport = {
    readonly histogram: {
        readonly min: number;
        readonly mean: number;
        readonly p50: number;
        readonly p90: number;
        readonly p99: number;
        readonly max: number;
    };
    readonly sampledBlocks: readonly { readonly atMs: number; readonly gapMs: number; }[];
};

export type CliPublishMeasurement = FrameRecorderResult & {
    readonly runtimeMs: number;
    readonly eventLoopReport: EventLoopProbeReport | undefined;
};

type CliExitEvent = {
    readonly exitCode: number;
    readonly signal?: number;
};

function getErrorCode(error: unknown): unknown {
    return typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function readNumberField(record: Readonly<Record<string, unknown>>, fieldName: string): number {
    const value = record[fieldName];
    if (typeof value !== 'number') {
        throw new TypeError(`Expected event-loop probe field "${fieldName}" to be a number`);
    }
    return value;
}

function parseHistogram(value: unknown): EventLoopProbeReport['histogram'] {
    if (!isRecord(value)) {
        throw new TypeError('Event-loop probe histogram must be an object');
    }

    return {
        min: readNumberField(value, 'min'),
        mean: readNumberField(value, 'mean'),
        p50: readNumberField(value, 'p50'),
        p90: readNumberField(value, 'p90'),
        p99: readNumberField(value, 'p99'),
        max: readNumberField(value, 'max')
    };
}

function parseSampledBlocks(value: unknown): EventLoopProbeReport['sampledBlocks'] {
    if (!Array.isArray(value)) {
        throw new TypeError('Event-loop probe sampledBlocks must be an array');
    }

    return value.map(function (entry: unknown) {
        if (!isRecord(entry)) {
            throw new TypeError('Event-loop probe sampled block must be an object');
        }
        return { atMs: readNumberField(entry, 'atMs'), gapMs: readNumberField(entry, 'gapMs') };
    });
}

function parseEventLoopProbeReport(value: unknown): EventLoopProbeReport {
    if (!isRecord(value)) {
        throw new TypeError('Event-loop probe report must be an object');
    }

    return {
        histogram: parseHistogram(value.histogram),
        sampledBlocks: parseSampledBlocks(value.sampledBlocks)
    };
}

export async function ensureNodePtyHelperIsExecutable(): Promise<void> {
    const helperPath = path.join(
        process.cwd(),
        'node_modules/node-pty/prebuilds',
        `${process.platform}-${process.arch}`,
        'spawn-helper'
    );

    try {
        await fs.chmod(helperPath, executablePermissions);
    } catch (error: unknown) {
        if (getErrorCode(error) !== 'ENOENT') {
            throw error;
        }
    }
}

async function readEventLoopProbeReport(probeOutputPath: string): Promise<EventLoopProbeReport | undefined> {
    try {
        const raw = await fs.readFile(probeOutputPath, 'utf8');
        await fs.rm(probeOutputPath, { force: true });
        return parseEventLoopProbeReport(JSON.parse(raw));
    } catch (error: unknown) {
        if (getErrorCode(error) === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

function spawnCliPublish(workingDirectory: string, probeOutputPath: string): nodePty.IPty {
    return nodePty.spawn(
        process.execPath,
        [
            '--experimental-strip-types',
            '--enable-source-maps',
            '--import',
            eventLoopProbePath,
            cliEntryPointPath,
            'publish'
        ],
        {
            cols: cliColumns,
            rows: cliRows,
            cwd: workingDirectory,
            name: 'xterm-color',
            // eslint-disable-next-line node/no-process-env -- the spawned subprocess inherits environment variables and additionally needs the probe output path
            env: { ...process.env, PACKTORY_BENCH_EVENT_LOOP_PROBE_OUTPUT: probeOutputPath } as const
        }
    );
}

async function waitForCliExit(pty: Readonly<nodePty.IPty>): Promise<CliExitEvent> {
    return new Promise<CliExitEvent>(function (resolve) {
        pty.onExit(function (event) {
            resolve(event);
        });
    });
}

function buildFailureError(event: CliExitEvent, outputChunks: readonly string[]): Error {
    const outputTail = outputChunks.join('').slice(-cliOutputTailLength);
    const failureMessage = [
        `CLI benchmark failed with exit code ${event.exitCode},`,
        `signal ${event.signal ?? 'none'}.`,
        outputTail
    ]
        .join(' ');
    return new Error(failureMessage);
}

type CliRunContext = {
    readonly probeOutputPath: string;
    readonly outputChunks: readonly string[];
    readonly frameRecorder: FrameRecorder;
    readonly startedAt: number;
    readonly pty: nodePty.IPty;
};

function startCliRun(workingDirectory: string, packageNames: readonly string[]): CliRunContext {
    const probeOutputPath = path.join(os.tmpdir(), `packtory-bench-event-loop-${randomUUID()}.json`);
    const outputChunks: string[] = [];
    const frameRecorder: FrameRecorder = createFrameRecorder(packageNames);
    const startedAt = currentPerformance.now();
    const pty = spawnCliPublish(workingDirectory, probeOutputPath);

    pty.onData(function (data) {
        outputChunks.push(data);
        frameRecorder.recordWrite(data);
    });

    return { probeOutputPath, outputChunks, frameRecorder, startedAt, pty };
}

export async function runCliPublish(
    workingDirectory: string,
    packageNames: readonly string[]
): Promise<CliPublishMeasurement> {
    const context = startCliRun(workingDirectory, packageNames);
    const exitEvent = await waitForCliExit(context.pty);
    const recordedFrames = await context.frameRecorder.finish();
    const runtimeMs = currentPerformance.now() - context.startedAt;
    const eventLoopReport = await readEventLoopProbeReport(context.probeOutputPath);

    if (exitEvent.exitCode !== 0) {
        throw buildFailureError(exitEvent, context.outputChunks);
    }

    return {
        runtimeMs,
        allFrameGaps: recordedFrames.allFrameGaps,
        perPackageFrameGaps: recordedFrames.perPackageFrameGaps,
        frameCount: recordedFrames.frameCount,
        eventLoopReport
    };
}
