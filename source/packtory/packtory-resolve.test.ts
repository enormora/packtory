import assert from 'node:assert';
import { test } from 'mocha';
import {
    emptyDeadCodeEliminator,
    emptyScheduler,
    failingScheduler,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../test-libraries/orchestrator-stub-fixtures.ts';
import { createResolveAndLinkAllValidated } from './packtory-resolve.ts';

function happyDependencies() {
    return {
        deadCodeEliminator: emptyDeadCodeEliminator,
        packageProcessor: stubPackageProcessor,
        scheduler: emptyScheduler,
        progressBroadcaster: stubProgressBroadcaster
    };
}

test('createResolveAndLinkAllValidated returns Ok([]) when no packages are configured', async () => {
    const resolve = createResolveAndLinkAllValidated(happyDependencies());

    const result = await resolve({ packageConfigs: {}, packtoryConfig: { packages: [] } } as never);

    assert.strictEqual(result.isOk, true);
});

test('createResolveAndLinkAllValidated wraps scheduler failures into a resolve-partial failure', async () => {
    const dependencies = {
        ...happyDependencies(),
        scheduler: failingScheduler({ succeeded: [], failures: [new Error('boom')] })
    };
    const resolve = createResolveAndLinkAllValidated(dependencies);

    const result = await resolve({ packageConfigs: {}, packtoryConfig: { packages: [] } } as never);

    if (!result.isErr || result.error.type !== 'partial') {
        assert.fail('expected a partial failure');
    }
    assert.deepStrictEqual(result.error.error.succeeded, []);
    assert.strictEqual(result.error.error.failures.length, 1);
    assert.strictEqual(result.error.error.failures[0]?.message, 'boom');
});
