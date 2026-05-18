/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unnecessary-condition -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { mapResolveFailureToPublishFailure } from './publish-failure-mapping.ts';

suite('publish-failure-mapping', function () {
    test('mapResolveFailureToPublishFailure passes config failures through unchanged', function () {
        const failure = { type: 'config', issues: ['bad'] } as const;
        assert.strictEqual(mapResolveFailureToPublishFailure(failure), failure);
    });

    test('mapResolveFailureToPublishFailure passes check failures through unchanged', function () {
        const failure = { type: 'checks', issues: ['rule'] } as const;
        assert.strictEqual(mapResolveFailureToPublishFailure(failure), failure);
    });

    test('mapResolveFailureToPublishFailure converts a partial resolve failure into a publish-partial failure with empty succeeded', function () {
        const failures = [{ message: 'boom' } as never];
        const mapped = mapResolveFailureToPublishFailure({ type: 'partial', error: { succeeded: [], failures } });

        assert.strictEqual(mapped.type, 'partial');
        if (mapped.type === 'partial') {
            assert.deepStrictEqual(mapped.succeeded, []);
            assert.strictEqual(mapped.failures, failures);
        }
    });
});
