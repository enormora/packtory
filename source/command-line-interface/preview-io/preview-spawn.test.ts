import assert from 'node:assert';
import { suite, test } from 'mocha';
import { defaultSpawnProcess } from './preview-spawn.ts';

suite('preview-spawn', function () {
    test('defaultSpawnProcess delegates to child_process.spawn with array args', async function () {
        const child = defaultSpawnProcess(process.execPath, [ '-e', 'process.exit(0)' ], {
            stdio: [ 'pipe', 'inherit', 'inherit' ]
        });

        if (child.stdin === null) {
            assert.fail('expected stdin to be available for pipe stdio');
        }
        child.stdin.end('');
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

        assert.strictEqual(child.stdin, null);
        child.unref();
        const exitCode = await new Promise<number | undefined>(function (resolve) {
            child.on('close', resolve);
        });

        assert.strictEqual(exitCode, 0);
    });
});
