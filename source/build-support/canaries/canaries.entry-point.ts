import { execFile as executeFile } from 'node:child_process';
import fileSystem from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { runCanaryCommandLineInterface } from './canary-command-line-interface.ts';
import { createShellCommandRunner, runSelectedCanary } from './canary-runner.ts';
import { createNodeImportProbe } from './package-application-programming-interface-inspection.ts';

const importProbeTimeoutMilliseconds = 10_000;
const shellCommandTimeoutMilliseconds = 900_000;
const millisecondsPerSecond = 1000;

const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });
const runShellCommand = createShellCommandRunner(shellCommandTimeoutMilliseconds, executeFile);

process.exitCode = await runCanaryCommandLineInterface(process.argv, {
    fileManager,
    async runCanary(manifestPath, name) {
        return await runSelectedCanary(manifestPath, name, {
            createProject(options) {
                return new Project(options);
            },
            async createTemporaryFolder(prefix) {
                return await fileSystem.promises.mkdtemp(path.join(temporaryDirectory(), prefix));
            },
            fileManager,
            async removeFolder(folderPath) {
                await fileSystem.promises.rm(folderPath, { recursive: true, force: true });
            },
            repositoryFolder: process.cwd(),
            runImportProbe: createNodeImportProbe(importProbeTimeoutMilliseconds, executeFile, process.execPath),
            async runCommand(command, cwd) {
                const started = performance.now();
                try {
                    return await runShellCommand(command, cwd);
                } finally {
                    if (command === 'packtory publish' || command.startsWith('packtory pack --all ')) {
                        const seconds = (performance.now() - started) / millisecondsPerSecond;
                        const phase = command === 'packtory publish' ? 'publish dry run' : 'pack --all';
                        process.stdout.write(`Canary ${phase}: ${seconds.toFixed(1)}s\n`);
                    }
                }
            }
        });
    },
    standardErrorWrite(message) {
        process.stderr.write(message);
    },
    standardOutputWrite(message) {
        process.stdout.write(message);
    }
});
