import fs from 'node:fs';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { runMutationTimeoutCheck } from './mutation-timeout-cli-runner.ts';

process.exitCode = await runMutationTimeoutCheck(process.argv, {
    fileManager: createFileManager({ hostFileSystem: fs.promises }),
    stderrWrite: (message) => {
        process.stderr.write(message);
    }
});
