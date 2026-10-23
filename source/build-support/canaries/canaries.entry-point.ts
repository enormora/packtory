import fileSystem from 'node:fs';
import path from 'node:path';
import { tmpdir as temporaryDirectory } from 'node:os';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { runCanaryCommandLineInterface } from './canary-command-line-interface.ts';
import { runSelectedCanary, runShellCommand } from './canary-runner.ts';

const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });

process.exitCode = await runCanaryCommandLineInterface(process.argv, {
    fileManager,
    async runCanary(manifestPath, name) {
        return await runSelectedCanary(manifestPath, name, {
            async createTemporaryFolder(prefix) {
                return await fileSystem.promises.mkdtemp(path.join(temporaryDirectory(), prefix));
            },
            fileManager,
            async removeFolder(folderPath) {
                await fileSystem.promises.rm(folderPath, { recursive: true, force: true });
            },
            repositoryFolder: process.cwd(),
            runCommand: runShellCommand
        });
    },
    standardErrorWrite(message) {
        process.stderr.write(message);
    },
    standardOutputWrite(message) {
        process.stdout.write(message);
    }
});
