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

const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });

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
            runCommand: createShellCommandRunner(shellCommandTimeoutMilliseconds, executeFile),
            runImportProbe: createNodeImportProbe(importProbeTimeoutMilliseconds, executeFile, process.execPath)
        });
    },
    standardErrorWrite(message) {
        process.stderr.write(message);
    },
    standardOutputWrite(message) {
        process.stdout.write(message);
    }
});
