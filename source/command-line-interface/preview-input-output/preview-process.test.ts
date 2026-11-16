import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createPreviewProcessSpawner, type SpawnFunction } from './preview-process.ts';

type SpawnedProcess = ReturnType<SpawnFunction>;

suite('preview process spawning', function () {
    for (const stdio of [ 'ignore', [ 'pipe', 'inherit', 'inherit' ] ] as const) {
        test(`forwards process arguments and ${JSON.stringify(stdio)} streams`, function () {
            const input = { on: fake(), end: fake() };
            const native = { stdin: stdio === 'ignore' ? null : input, on: fake(), unref: fake() };
            const launch = fake.returns(native);
            const args = [ 'preview.txt' ] as const;
            const child = createPreviewProcessSpawner(launch)('viewer', args, { detached: true, stdio });
            assert.deepStrictEqual(launch.firstCall.args, [ 'viewer', [ 'preview.txt' ], { detached: true, stdio } ]);
            assert.notStrictEqual(launch.firstCall.args[1], args);
            assert.strictEqual(child.standardInput, native.stdin);
        });
    }

    test('forwards process event listeners', function () {
        const native = { stdin: null, on: fake(), unref: fake() };
        const child = createPreviewProcessSpawner(fake.returns(native))('viewer', [], { stdio: 'ignore' });
        const listener: Parameters<SpawnedProcess['on']>[1] = fake();
        child.on('close', listener);
        assert.deepStrictEqual(native.on.firstCall.args, [ 'close', listener ]);
    });

    test('releases the process reference', function () {
        const native = { stdin: null, on: fake(), unref: fake() };
        const child = createPreviewProcessSpawner(fake.returns(native))('viewer', [], { stdio: 'ignore' });
        child.unref();
        assert.strictEqual(native.unref.callCount, 1);
    });
});
