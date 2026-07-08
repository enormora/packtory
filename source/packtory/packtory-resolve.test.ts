import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    emptyDeadCodeEliminator,
    emptyScheduler,
    failingScheduler,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../test-libraries/orchestrator-stub-fixtures.ts';
import { createResolveAndLinkAllValidated, type CheckDependencies } from './packtory-resolve.ts';

function happyDependencies(): CheckDependencies {
    return {
        deadCodeEliminator: emptyDeadCodeEliminator,
        packageProcessor: stubPackageProcessor,
        scheduler: emptyScheduler,
        progressBroadcaster: stubProgressBroadcaster,
        versionManager: {
            addVersion() {
                throw new Error('versionManager.addVersion should not run when no ATTW check is configured');
            }
        }
    };
}

suite('packtory-resolve', function () {
    test('createResolveAndLinkAllValidated returns Ok([]) when no packages are configured', async function () {
        const resolve = createResolveAndLinkAllValidated(happyDependencies());

        const result = await resolve({ packageConfigs: {}, packtoryConfig: { packages: [] } } as never);

        assert.strictEqual(result.isOk, true);
    });

    test('createResolveAndLinkAllValidated wraps scheduler failures into a resolve-partial failure', async function () {
        const dependencies = {
            ...happyDependencies(),
            scheduler: failingScheduler({ succeeded: [], failures: [ new Error('boom') ] })
        };
        const resolve = createResolveAndLinkAllValidated(dependencies);

        const result = await resolve({ packageConfigs: {}, packtoryConfig: { packages: [] } } as never);

        if (!result.isErr || result.error.type !== 'partial') {
            assert.fail('expected a partial failure');
        }
        assert.partialDeepStrictEqual(result, {
            error: {
                error: {
                    succeeded: [],
                    failures: {
                        length: 1
                    }
                }
            }
        });
        assert.strictEqual(result.error.error.failures[0]?.message, 'boom');
    });
});
