import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    assertFailureLog,
    createReleaseHandlerDeps,
    createReleasePackage,
    createReleasePlanFailureOutcome,
    createReleasePlanOutcome
} from '../../test-libraries/release-handler-test-support.ts';
import { runReleaseHandler } from './release-handler.ts';

suite('changelog failures', function () {
    test('returns 1 when the post-commit release plan fails', async function () {
        await assertFailureLog(
            {
                flags: { writeChangelog: true, commit: true, publish: true, noDryRun: true },
                planOutcomes: [
                    createReleasePlanOutcome([ createReleasePackage() ]),
                    createReleasePlanFailureOutcome()
                ]
            },
            /Configuration issues/u
        );
    });

    test('returns 1 when loading config throws', async function () {
        const deps = createReleaseHandlerDeps({
            configLoader: { load: fake.rejects(new Error('load failed')) }
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 1);
        assert.deepStrictEqual(deps.log.firstCall.args, [ 'load failed' ]);
    });

    test('returns 1 when loading config throws a non-error value', async function () {
        const deps = createReleaseHandlerDeps({
            configLoader: { load: fake.rejects('string failure') }
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 1);
        assert.deepStrictEqual(deps.log.firstCall.args, [ 'string failure' ]);
    });
});
