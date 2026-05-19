import assert from 'node:assert';
import { suite, test } from 'mocha';
import { mapResolveFailureToReleaseDiffFailure } from './release-diff-failure-mapping.ts';

suite('release-diff-failure-mapping', function () {
    test('mapResolveFailureToReleaseDiffFailure passes config failures through unchanged', function () {
        const failure = { type: 'config' as const, issues: ['bad'] };
        assert.strictEqual(mapResolveFailureToReleaseDiffFailure(failure), failure);
    });

    test('mapResolveFailureToReleaseDiffFailure passes check failures through unchanged', function () {
        const failure = { type: 'checks' as const, issues: ['bad check'] };
        assert.strictEqual(mapResolveFailureToReleaseDiffFailure(failure), failure);
    });

    test('mapResolveFailureToReleaseDiffFailure converts a partial resolve failure into a release-diff partial failure with empty succeeded', function () {
        const resolveFailures = [new Error('a'), new Error('b')];
        const result = mapResolveFailureToReleaseDiffFailure({
            type: 'partial',
            error: { succeeded: [], failures: resolveFailures }
        });
        if (result.type !== 'partial') {
            assert.fail(`expected partial failure, got ${result.type}`);
        }
        assert.deepStrictEqual(result.succeeded, []);
        assert.deepStrictEqual(result.failures, resolveFailures);
    });
});
