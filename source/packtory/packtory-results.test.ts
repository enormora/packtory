/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import { Result } from 'true-myth';
import type { BuildAndPublishResult } from './package-processor.ts';
import {
    configError,
    createPublishAllOutcome,
    createResolveAndLinkAllOutcome,
    publishPartialFailure,
    resolvePartialFailure,
    type BuildReport,
    type PublishAllResult,
    type ResolveAndLinkAllResult
} from './packtory-results.ts';

test('configError wraps the given issues in a discriminated config-failure variant', () => {
    assert.deepStrictEqual(configError(['a', 'b']), { type: 'config', issues: ['a', 'b'] });
});

test('publishPartialFailure tags a PartialError as a publish-partial failure', () => {
    const failure = publishPartialFailure({
        succeeded: [] as readonly BuildAndPublishResult[],
        failures: [{ message: 'boom' } as never]
    });
    assert.strictEqual(failure.type, 'partial');
    assert.deepStrictEqual(failure.failures, [{ message: 'boom' }]);
});

test('resolvePartialFailure wraps a PartialError under the partial discriminator', () => {
    const partial = resolvePartialFailure({ succeeded: [], failures: [] });
    assert.strictEqual(partial.type, 'partial');
    assert.deepStrictEqual(partial.error, { succeeded: [], failures: [] });
});

test('createPublishAllOutcome captures the result and the report getter', () => {
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

test('createResolveAndLinkAllOutcome captures the result and the report getter', () => {
    const result = Result.err({ type: 'config', issues: [] }) as ResolveAndLinkAllResult;
    const outcome = createResolveAndLinkAllOutcome(result, () => undefined);

    assert.strictEqual(outcome.result, result);
    assert.strictEqual(outcome.getReport(), undefined);
});
