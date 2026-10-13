import fileSystem from 'node:fs';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { runMutationTimeoutCheck } from './mutation-timeout-command-line-interface-runner.ts';

process.exitCode = await runMutationTimeoutCheck(process.argv, {
    fileManager: createFileManager({ hostFileSystem: fileSystem.promises }),
    standardErrorWrite(message) {
        process.stderr.write(message);
    }
});
