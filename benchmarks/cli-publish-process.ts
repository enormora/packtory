import path from 'node:path';
import fs from 'node:fs/promises';
import { performance as currentPerformance } from 'node:perf_hooks';
import * as nodePty from 'node-pty';
import { createFrameRecorder, type FrameRecorder } from './cli-spinner-metrics.ts';

const cliColumns = 120;
const cliRows = 40;
const cliOutputTailLength = 4000;
const executablePermissions = 0o700;
const cliEntryPointPath = path.join(
    process.cwd(),
    'source/packages/command-line-interface/command-line-interface.entry-point.ts'
);

function getErrorCode(error: unknown): unknown {
    return typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
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

export async function runCliPublish(
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
        const frameRecorder: FrameRecorder = createFrameRecorder(packageNames);
        const startedAt = currentPerformance.now();
        const pty = nodePty.spawn(
            process.execPath,
            ['--experimental-strip-types', '--enable-source-maps', cliEntryPointPath, 'publish'],
            {
                cols: cliColumns,
                rows: cliRows,
                cwd: workingDirectory,
                name: 'xterm-color'
            }
        );

        pty.onData((data) => {
            outputChunks.push(data);
            frameRecorder.recordWrite(data);
        });

        pty.onExit(async (event) => {
            const recordedFrames = await frameRecorder.finish();
            const runtimeMs = currentPerformance.now() - startedAt;
            const outputTail = outputChunks.join('').slice(-cliOutputTailLength);

            if (event.exitCode !== 0) {
                const failureMessage = [
                    `CLI benchmark failed with exit code ${event.exitCode},`,
                    `signal ${event.signal ?? 'none'}.`,
                    outputTail
                ].join(' ');

                reject(new Error(failureMessage));
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
