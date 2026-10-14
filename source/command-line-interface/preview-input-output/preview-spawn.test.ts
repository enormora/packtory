import assert from 'node:assert';
import { suite, test } from 'mocha';
import { defaultSpawnProcess } from './preview-spawn.ts';

function countReferencedChildProcesses(): number {
    return process
        .getActiveResourcesInfo()
        .filter(function isChildProcess(resource) {
            return resource === 'ProcessWrap';
        })
        .length;
}

suite('preview-spawn', function () {
    test('defaultSpawnProcess delegates to child_process.spawn with array args', async function () {
        const child = defaultSpawnProcess(process.execPath, [ '-e', 'process.exit(0)' ], {
            stdio: [ 'pipe', 'inherit', 'inherit' ]
        });

        if (child.standardInput === null) {
            assert.fail('expected stdin to be available for pipe stdio');
        }
        child.standardInput.end('');
        const exitCode = await new Promise<number | undefined>(function (resolve) {
            child.on('close', resolve);
        });

        assert.strictEqual(exitCode, 0);
    });

    test('defaultSpawnProcess preserves ignored stdio', async function () {
        const child = defaultSpawnProcess(process.execPath, [ '-e', 'process.exit(0)' ], {
            detached: true,
            stdio: 'ignore'
        });

        assert.strictEqual(child.standardInput, null);
        const referencedChildProcesses = countReferencedChildProcesses();
        assert.ok(referencedChildProcesses > 0);
        child.unref();
        assert.strictEqual(countReferencedChildProcesses(), referencedChildProcesses - 1);
        const exitCode = await new Promise<number | undefined>(function (resolve) {
            child.on('close', resolve);
        });

        assert.strictEqual(exitCode, 0);
    });
});
