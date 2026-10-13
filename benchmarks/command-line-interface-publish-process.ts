import path from 'node:path';
import operatingSystem from 'node:os';
import { randomUUID as createUniqueIdentifier } from 'node:crypto';
import fileSystem from 'node:fs/promises';
import { performance as currentPerformance } from 'node:perf_hooks';
import * as nodePseudoTerminal from 'node-pty';
import {
    createFrameRecorder,
    type FrameRecorder,
    type FrameRecorderResult
} from './command-line-interface-spinner-metrics.ts';

type PseudoTerminal = Pick<nodePseudoTerminal.IPty, 'onData' | 'onExit'>;

const commandLineInterfaceColumns = 120;
const commandLineInterfaceRows = 40;
const commandLineInterfaceOutputTailLength = 4000;
const executablePermissions = 0o700;
const commandLineInterfaceEntryPointPath = path.join(
    process.cwd(),
    'source/packages/command-line-interface/command-line-interface.entry-point.ts'
);
const eventLoopProbePath = path.join(process.cwd(), 'benchmarks/command-line-interface-event-loop-probe.ts');

export type EventLoopProbeReport = {
    readonly histogram: {
        readonly minimum: number;
        readonly mean: number;
        readonly p50: number;
        readonly p90: number;
        readonly p99: number;
        readonly maximum: number;
    };
    readonly sampledBlocks: readonly { readonly atMilliseconds: number; readonly gapMilliseconds: number; }[];
};

export type CommandLineInterfacePublishMeasurement = FrameRecorderResult & {
    readonly runtimeMilliseconds: number;
    readonly eventLoopReport: EventLoopProbeReport | undefined;
};

type CommandLineInterfaceExitEvent = {
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
        minimum: readNumberField(value, 'min'),
        mean: readNumberField(value, 'mean'),
        p50: readNumberField(value, 'p50'),
        p90: readNumberField(value, 'p90'),
        p99: readNumberField(value, 'p99'),
        maximum: readNumberField(value, 'max')
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
        return {
            atMilliseconds: readNumberField(entry, 'atMilliseconds'),
            gapMilliseconds: readNumberField(entry, 'gapMilliseconds')
        };
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

export async function ensureNodePseudoTerminalHelperIsExecutable(): Promise<void> {
    const helperPath = path.join(
        process.cwd(),
        'node_modules/node-pty/prebuilds',
        `${process.platform}-${process.arch}`,
        'spawn-helper'
    );

    try {
        await fileSystem.chmod(helperPath, executablePermissions);
    } catch (error: unknown) {
        if (getErrorCode(error) !== 'ENOENT') {
            throw error;
        }
    }
}

async function readEventLoopProbeReport(probeOutputPath: string): Promise<EventLoopProbeReport | undefined> {
    try {
        const raw = await fileSystem.readFile(probeOutputPath, 'utf8');
        await fileSystem.rm(probeOutputPath, { force: true });
        return parseEventLoopProbeReport(JSON.parse(raw));
    } catch (error: unknown) {
        if (getErrorCode(error) === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

function spawnCommandLineInterfacePublish(workingDirectory: string, probeOutputPath: string): PseudoTerminal {
    return nodePseudoTerminal.spawn(
        process.execPath,
        [
            '--experimental-strip-types',
            '--enable-source-maps',
            '--import',
            eventLoopProbePath,
            commandLineInterfaceEntryPointPath,
            'publish'
        ],
        {
            cols: commandLineInterfaceColumns,
            rows: commandLineInterfaceRows,
            cwd: workingDirectory,
            name: 'xterm-color',
            // eslint-disable-next-line node/no-process-env -- the spawned subprocess inherits environment variables and additionally needs the probe output path
            env: { ...process.env, PACKTORY_BENCH_EVENT_LOOP_PROBE_OUTPUT: probeOutputPath } as const
        }
    );
}

async function waitForCommandLineInterfaceExit(
    pseudoTerminal: Readonly<PseudoTerminal>
): Promise<CommandLineInterfaceExitEvent> {
    return new Promise<CommandLineInterfaceExitEvent>(function (resolve) {
        pseudoTerminal.onExit(function (event) {
            resolve(event);
        });
    });
}

function buildFailureError(event: CommandLineInterfaceExitEvent, outputChunks: readonly string[]): Error {
    const outputTail = outputChunks.join('').slice(-commandLineInterfaceOutputTailLength);
    const failureMessage = [
        `CLI benchmark failed with exit code ${event.exitCode},`,
        `signal ${event.signal ?? 'none'}.`,
        outputTail
    ]
        .join(' ');
    return new Error(failureMessage);
}

type CommandLineInterfaceRunContext = {
    readonly probeOutputPath: string;
    readonly outputChunks: readonly string[];
    readonly frameRecorder: FrameRecorder;
    readonly startedAt: number;
    readonly pseudoTerminal: PseudoTerminal;
};

function startCommandLineInterfaceRun(
    workingDirectory: string,
    packageNames: readonly string[]
): CommandLineInterfaceRunContext {
    const probeOutputPath = path.join(
        operatingSystem.tmpdir(),
        `packtory-bench-event-loop-${createUniqueIdentifier()}.json`
    );
    const outputChunks: string[] = [];
    const frameRecorder: FrameRecorder = createFrameRecorder(packageNames);
    const startedAt = currentPerformance.now();
    const pseudoTerminal = spawnCommandLineInterfacePublish(workingDirectory, probeOutputPath);

    pseudoTerminal.onData(function (data) {
        outputChunks.push(data);
        frameRecorder.recordWrite(data);
    });

    return { probeOutputPath, outputChunks, frameRecorder, startedAt, pseudoTerminal };
}

export async function runCommandLineInterfacePublish(
    workingDirectory: string,
    packageNames: readonly string[]
): Promise<CommandLineInterfacePublishMeasurement> {
    const context = startCommandLineInterfaceRun(workingDirectory, packageNames);
    const exitEvent = await waitForCommandLineInterfaceExit(context.pseudoTerminal);
    const recordedFrames = await context.frameRecorder.finish();
    const runtimeMilliseconds = currentPerformance.now() - context.startedAt;
    const eventLoopReport = await readEventLoopProbeReport(context.probeOutputPath);

    if (exitEvent.exitCode !== 0) {
        throw buildFailureError(exitEvent, context.outputChunks);
    }

    return {
        runtimeMilliseconds,
        allFrameGaps: recordedFrames.allFrameGaps,
        perPackageFrameGaps: recordedFrames.perPackageFrameGaps,
        frameCount: recordedFrames.frameCount,
        eventLoopReport
    };
}
