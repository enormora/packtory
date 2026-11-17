import assert from 'node:assert';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { suite, test } from 'mocha';
import { createShellCommandRunner } from '../../../source/build-support/canaries/canary-runner.ts';

import { executeNativeCanaryProcess } from './native-runtime.ts';

const runShellCommand = createShellCommandRunner(900_000, executeNativeCanaryProcess);

async function withTemporaryShellPackage<T>(action: (folderPath: string) => Promise<T>): Promise<T> {
    const folderPath = await mkdtemp(path.join(temporaryDirectory(), 'packtory-canary-runner-'));
    try {
        await mkdir(path.join(folderPath, 'node_modules', '.bin'), {
            recursive: true
        });
        return await action(folderPath);
    } finally {
        await rm(folderPath, {
            recursive: true,
            force: true
        });
    }
}

suite('canary-runner', function () {
    test('runShellCommand uses the clone-local package bin path and dry-run token', async function () {
        await withTemporaryShellPackage(async function (folderPath) {
            const executablePath = path.join(folderPath, 'node_modules', '.bin', 'print-token');
            await writeFile(executablePath, '#!/usr/bin/env sh\nprintf "%s" "$NPM_TOKEN"\n');
            await chmod(executablePath, 0o755);
            assert.deepStrictEqual(await runShellCommand('print-token', folderPath), {
                standardError: '',
                standardOutput: 'dry-run'
            });
        });
    });

    test('reports command output when shell execution fails', async function () {
        await withTemporaryShellPackage(async function (folderPath) {
            await assert.rejects(
                runShellCommand('printf out; printf err >&2; exit 7', folderPath),
                /out\nerr\nCommand failed/u
            );
        });
    });
    for (const timeoutMilliseconds of [ 100 ]) {
        test(`reports shell timeouts after ${timeoutMilliseconds} milliseconds`, async function () {
            await withTemporaryShellPackage(async function (folderPath) {
                const runCommand = createShellCommandRunner(timeoutMilliseconds, executeNativeCanaryProcess);
                const duration = timeoutMilliseconds < 1000 ? '100 ms' : '1 seconds';
                await assert.rejects(runCommand('exec sleep 5', folderPath), {
                    message: `Command timed out after ${duration}: exec sleep 5`
                });
            });
        });
    }
});
