import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { runCanaryCli } from './canary-cli-runner.ts';
import { runSelectedCanary, runShellCommand } from './canary-runner.ts';

const fileManager = createFileManager({ hostFileSystem: fs.promises });

process.exitCode = await runCanaryCli(process.argv, {
    fileManager,
    async runCanary(manifestPath, name) {
        return await runSelectedCanary(manifestPath, name, {
            async createTemporaryFolder(prefix) {
                return await fs.promises.mkdtemp(path.join(tmpdir(), prefix));
            },
            fileManager,
            async removeFolder(folderPath) {
                await fs.promises.rm(folderPath, { recursive: true, force: true });
            },
            repositoryFolder: process.cwd(),
            runCommand: runShellCommand
        });
    },
    stderrWrite(message) {
        process.stderr.write(message);
    },
    stdoutWrite(message) {
        process.stdout.write(message);
    }
});
