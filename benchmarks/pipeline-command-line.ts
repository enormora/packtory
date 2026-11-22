import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath as fileUrlToPath } from 'node:url';
import { z } from 'zod/mini';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { PipelineExecution } from './pipeline-execution.ts';
import type { WorkMetrics } from './performance-benchmark-types.ts';

const commandTimeoutMilliseconds = 120_000;
const entryPoint = new URL('./command-line-benchmark.entry-point.ts', import.meta.url);
const commandMeasurementSchema = z.object({ workMilliseconds: z.number().check(z.gt(0)) });
type CommandMeasurement = { readonly output: string; readonly workMilliseconds: number; };

async function runCommand(processArguments: readonly string[], workingDirectory: string): Promise<CommandMeasurement> {
    const result = await new Promise<{ readonly output: string; readonly diagnostics: string; }>(
        function (resolve, reject) {
            execFile(
                process.execPath,
                [ '--experimental-strip-types', fileUrlToPath(entryPoint), ...processArguments ],
                {
                    cwd: workingDirectory,
                    timeout: commandTimeoutMilliseconds
                },
                function (error, stdout, stderr) {
                    if (error === null) {
                        resolve({ output: stdout, diagnostics: stderr });
                    } else {
                        reject(
                            new Error([ 'Command line benchmark failed', stderr, stdout ].join('\n'), { cause: error })
                        );
                    }
                }
            );
        }
    );
    const measurement = commandMeasurementSchema.parse(
        JSON.parse(result.diagnostics.trim().split('\n').at(-1) ?? 'null')
    );
    return { output: result.output, workMilliseconds: measurement.workMilliseconds };
}

export async function prepareCommandLineConfiguration(
    fileManager: FileManager,
    execution: PipelineExecution
): Promise<void> {
    await fileManager.writeFile(
        `${execution.projectFolder}/packtory.config.js`,
        `export const config = ${JSON.stringify(execution.workload.configuration)};\n`
    );
}

async function measureHelp(execution: PipelineExecution): Promise<number> {
    const command = await runCommand([ '--help' ], execution.projectFolder);
    assert.match(command.output, /publish/u);
    return command.workMilliseconds;
}

async function measurePacking(execution: PipelineExecution): Promise<number> {
    const command = await runCommand([
        'pack',
        '--all',
        '--format',
        'folder',
        '--out',
        execution.outputPath,
        '--version',
        '1.0.0',
        '--vendor-dependencies'
    ], execution.projectFolder);
    assert.match(command.output, /Packed \d+ packages/u);
    return command.workMilliseconds;
}

async function measurePublication(execution: PipelineExecution): Promise<number> {
    const command = await runCommand([ 'publish' ], execution.projectFolder);
    assert.match(command.output, /dry-run mode was enabled/iu);
    for (const configuration of execution.workload.configuration.packages) {
        assert.ok(command.output.includes(configuration.name), `CLI omitted ${configuration.name}`);
    }
    return command.workMilliseconds;
}

export async function executeCommandLinePipeline(execution: PipelineExecution): Promise<{
    readonly metrics: WorkMetrics;
    readonly workMilliseconds: number;
}> {
    const helpMilliseconds = execution.scenario.mode === 'analysis' ? await measureHelp(execution) : 0;
    const packingMilliseconds = [ 'batch', 'pack-then-publish' ].includes(execution.scenario.mode)
        ? await measurePacking(execution)
        : 0;
    const publicationMilliseconds = [ 'publish', 'pack-then-publish' ].includes(execution.scenario.mode)
        ? await measurePublication(execution)
        : 0;
    return {
        metrics: { ...execution.pipeline.metrics(), phaseCountersAvailable: false },
        workMilliseconds: helpMilliseconds + packingMilliseconds + publicationMilliseconds
    };
}
