import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath as fileUrlToPath } from 'node:url';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { PipelineExecution } from './pipeline-execution.ts';
import type { WorkMetrics } from './performance-benchmark-types.ts';

const commandTimeoutMilliseconds = 120_000;
const entryPoint = new URL(
    '../source/packages/command-line-interface/command-line-interface.entry-point.ts',
    import.meta.url
);

async function runCommand(processArguments: readonly string[], workingDirectory: string): Promise<string> {
    return new Promise(function (resolve, reject) {
        execFile(process.execPath, [ '--experimental-strip-types', fileUrlToPath(entryPoint), ...processArguments ], {
            cwd: workingDirectory,
            timeout: commandTimeoutMilliseconds
        }, function (error, stdout, stderr) {
            if (error === null) {
                resolve(stdout);
            } else {
                reject(new Error([ 'Command line benchmark failed', stderr, stdout ].join('\n'), { cause: error }));
            }
        });
    });
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

async function runStartupControl(execution: PipelineExecution): Promise<void> {
    if (execution.scenario.mode === 'analysis') {
        const output = await runCommand([ '--help' ], execution.projectFolder);
        assert.match(output, /publish/u);
    }
}

export async function executeCommandLinePipeline(execution: PipelineExecution): Promise<WorkMetrics> {
    await runStartupControl(execution);
    if ([ 'batch', 'pack-then-publish' ].includes(execution.scenario.mode)) {
        const output = await runCommand([
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
        assert.match(output, /Packed \d+ packages/u);
    }
    if ([ 'publish', 'pack-then-publish' ].includes(execution.scenario.mode)) {
        const output = await runCommand([ 'publish' ], execution.projectFolder);
        assert.match(output, /dry-run mode was enabled/iu);
        for (const configuration of execution.workload.configuration.packages) {
            assert.ok(output.includes(configuration.name), `CLI omitted ${configuration.name}`);
        }
    }
    return { ...execution.pipeline.metrics(), phaseCountersAvailable: false };
}
