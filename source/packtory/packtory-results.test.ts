/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import type { BuildAndPublishResult } from './package-processor.ts';
import {
    configError,
    createPublishAllOutcome,
    createReleaseAnalysisOutcome,
    createResolveAndLinkAllOutcome,
    publishPartialFailure,
    type PublishFailure,
    releaseAnalysisPartialFailure,
    type ReleaseAnalysisFailure,
    resolvePartialFailure,
    type BuildReport,
    type PublishAllResult,
    type ReleaseAnalysisResult,
    type ResolveAndLinkAllResult
} from './packtory-results.ts';

suite('packtory-results', function () {
    function createFailureStub() {
        return [{ message: 'boom' } as never];
    }

    function assertTaggedPartialFailure(failure: PublishFailure | ReleaseAnalysisFailure): void {
        assert.strictEqual(failure.type, 'partial');
        if (!('failures' in failure)) {
            assert.fail('Expected a partial failure with direct failures');
        }
        assert.deepStrictEqual(failure.failures, [{ message: 'boom' }]);
    }

    test('configError wraps the given issues in a discriminated config-failure variant', function () {
        assert.deepStrictEqual(configError(['a', 'b']), { type: 'config', issues: ['a', 'b'] });
    });

    test('publishPartialFailure tags a PartialError as a publish-partial failure', function () {
        assertTaggedPartialFailure(
            publishPartialFailure({
                succeeded: [] as readonly BuildAndPublishResult[],
                failures: createFailureStub()
            })
        );
    });

    test('resolvePartialFailure wraps a PartialError under the partial discriminator', function () {
        const partial = resolvePartialFailure({ succeeded: [], failures: [] });
        assert.strictEqual(partial.type, 'partial');
        assert.deepStrictEqual(partial.error, { succeeded: [], failures: [] });
    });

    test('releaseAnalysisPartialFailure tags a PartialError as a release-analysis partial failure', function () {
        assertTaggedPartialFailure(
            releaseAnalysisPartialFailure({
                succeeded: [],
                failures: createFailureStub()
            })
        );
    });

    test('createPublishAllOutcome captures the result and the report getter', function () {
        const result = Result.err({ type: 'config', issues: [] }) as PublishAllResult;
        const report: BuildReport = {
            schemaVersion: 1,
            generatedAt: 'x',
            packages: {},
            aggregate: { crossBundleLinks: [] }
        };
        const outcome = createPublishAllOutcome(result, () => report);

        assert.strictEqual(outcome.result, result);
        assert.strictEqual(outcome.getReport(), report);
    });

    test('createResolveAndLinkAllOutcome captures the result and the report getter', function () {
        const result = Result.err({ type: 'config', issues: [] }) as ResolveAndLinkAllResult;
        const outcome = createResolveAndLinkAllOutcome(result, () => undefined);

        assert.strictEqual(outcome.result, result);
        assert.strictEqual(outcome.getReport(), undefined);
    });

    test('createReleaseAnalysisOutcome captures the result and the report getter', function () {
        const result = Result.err({ type: 'config', issues: [] }) as ReleaseAnalysisResult;
        const outcome = createReleaseAnalysisOutcome(result, () => undefined as never);

        assert.strictEqual(outcome.result, result);
        assert.strictEqual(outcome.getReport(), undefined);
    });
});
