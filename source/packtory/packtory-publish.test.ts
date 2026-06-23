import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import {
    emptyScheduler,
    failingScheduler,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../test-libraries/orchestrator-stub-fixtures.ts';
import { createRunBuildAndPublishValidated } from './packtory-publish.ts';

function happyDependencies() {
    return {
        packageProcessor: stubPackageProcessor,
        scheduler: emptyScheduler,
        progressBroadcaster: stubProgressBroadcaster,
        repositoryFolder: '/'
    };
}

suite('packtory-publish', function () {
    test('createRunBuildAndPublishValidated returns Ok([]) when resolve and publish both succeed with no packages', async function () {
        const run = createRunBuildAndPublishValidated(happyDependencies());

        const result = await run(
            { packageConfigs: {}, packtoryConfig: { packages: [] } } as never,
            { dryRun: false, stage: false },
            async () => Result.ok([])
        );

        assert.strictEqual(result.isOk, true);
    });

    test('createRunBuildAndPublishValidated maps resolve failures into publish failures via the mapping helper', async function () {
        const run = createRunBuildAndPublishValidated(happyDependencies());

        const result = await run(
            { packageConfigs: {}, packtoryConfig: { packages: [] } } as never,
            { dryRun: false, stage: false },
            async () => Result.err({ type: 'config', issues: ['bad'] })
        );

        if (!result.isErr) {
            assert.fail('expected the result to be an error');
        }
        assert.deepStrictEqual(result.error, { type: 'config', issues: ['bad'] });
    });

    test('createRunBuildAndPublishValidated wraps publish-stage partial failures into the publish-partial variant', async function () {
        const dependencies = {
            ...happyDependencies(),
            scheduler: failingScheduler({ succeeded: [], failures: [new Error('boom')] })
        };

        const run = createRunBuildAndPublishValidated(dependencies);

        const result = await run(
            { packageConfigs: {}, packtoryConfig: { packages: [] } } as never,
            { dryRun: false, stage: false },
            async () => Result.ok([])
        );

        if (!result.isErr) {
            assert.fail('expected the result to be an error');
        }
        assert.strictEqual(result.error.type, 'partial');
    });
});
