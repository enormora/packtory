import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { stagedForApproval } from '../publication-outcome.ts';
import {
    expectFailure,
    publishWithBearerToken,
    registryClientFactory
} from '../../test-libraries/registry-client-test-support.ts';

suite('registry-client publish outcomes', function () {
    test('publishPackage() forwards the access and provenance options resolved from publishSettings to libnpmpublish', async function () {
        const publish = fake.resolves(undefined);
        const registryClient = registryClientFactory({ publish });

        await publishWithBearerToken(registryClient, { access: 'public', provenance: { type: 'auto' } }, false);

        const publishOptions = publish.firstCall.args.at(-1) as Record<string, unknown>;
        assert.strictEqual(publishOptions.access, 'public');
        assert.strictEqual(publishOptions.provenance, true);
    });

    test('publishPackage() rewrites a libnpmpublish error through the publish-settings bridge', async function () {
        const original = Object.assign(
            new Error('Automatic provenance generation not supported for provider: jenkins'),
            {
                code: 'EUSAGE'
            }
        );
        const publish = fake.rejects(original);
        const registryClient = registryClientFactory({ publish });

        try {
            await publishWithBearerToken(registryClient, { access: 'public', provenance: { type: 'auto' } }, false);
            assert.fail('Expected publishPackage() to throw');
        } catch (error: unknown) {
            assert.ok(error instanceof Error, 'Expected the thrown value to be an Error');
            assert.match(error.message, /^Provenance auto mode requires GitHub Actions or GitLab CI/u);
            assert.strictEqual(error.cause, original);
        }
    });

    test('publishPackage() stages the package and returns the stage id when stage mode is enabled', async function () {
        const publish = fake.resolves({ stageId: 'stage-123' });
        const registryClient = registryClientFactory({ publish });

        const result = await publishWithBearerToken(registryClient, { access: 'public' }, true);

        assert.deepStrictEqual(result, stagedForApproval('stage-123'));
        assert.strictEqual((publish.firstCall.lastArg as { readonly stage?: boolean; }).stage, true);
    });

    test('publishPackage() rejects a staged publish response without a stage id', async function () {
        const publish = fake.resolves({});
        const registryClient = registryClientFactory({ publish });

        await expectFailure(async function () {
            await publishWithBearerToken(registryClient, { access: 'public' }, true);
        }, /without returning a stage ID/u);
    });

    suite('publishPackage() rejects invalid staged publish responses', function () {
        for (
            const [ testName, response ] of [
                [ 'when the response is null', null ],
                [ 'when the response is a string', 'not-a-stage-response' ],
                [ 'when the stage id is numeric', { stageId: 123 } ],
                [ 'when the stage id is object-shaped but not a string', { stageId: { length: 1 } } ],
                [ 'when the stage id is empty', { stageId: '' } ]
            ] as const
        ) {
            test(testName, async function () {
                const publish = fake.resolves(response);
                const registryClient = registryClientFactory({ publish });

                await expectFailure(async function () {
                    await publishWithBearerToken(registryClient, { access: 'public' }, true);
                }, /without returning a stage ID/u);
            });
        }
    });
});
