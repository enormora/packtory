import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { ValidConfigResult } from '../config/validation.ts';
import type { BuildReport } from '../report/aggregator/report-types.ts';
import {
    emptyScheduler,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../test-libraries/orchestrator-stub-fixtures.ts';
import { createDiffAgainstLatestPublishedValidated } from './packtory-release-diff.ts';
import type { ResolvedPackage } from './resolved-package.ts';

const artifactsBuilder = { collectContents: () => [] } as unknown as Pick<ArtifactsBuilder, 'collectContents'>;

function configFor(packageNames: readonly string[]): ValidConfigResult {
    return {
        packtoryConfig: {
            packages: packageNames.map((name) => {
                return { name };
            })
        }
    } as unknown as ValidConfigResult;
}

function emptyReport(): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-19T00:00:00.000Z',
        packages: {},
        aggregate: { crossBundleLinks: [] }
    };
}

suite('packtory-release-diff', function () {
    test('propagates a resolve-stage config failure as a release-diff config failure', async function () {
        const diffAgainstLatestPublishedValidated = createDiffAgainstLatestPublishedValidated({
            artifactsBuilder,
            packageProcessor: stubPackageProcessor,
            progressBroadcaster: stubProgressBroadcaster,
            scheduler: emptyScheduler
        });
        const result = await diffAgainstLatestPublishedValidated(
            configFor([]),
            async () => Result.err({ type: 'config', issues: ['bad config'] }),
            emptyReport
        );

        if (result.isOk) {
            assert.fail('expected an Err result');
        }
        assert.strictEqual(result.error.type, 'config');
    });

    test('returns an Ok release-diff result when resolve and publish-stage both succeed', async function () {
        const diffAgainstLatestPublishedValidated = createDiffAgainstLatestPublishedValidated({
            artifactsBuilder,
            packageProcessor: stubPackageProcessor,
            progressBroadcaster: stubProgressBroadcaster,
            scheduler: emptyScheduler
        });
        const result = await diffAgainstLatestPublishedValidated(
            configFor([]),
            async () => Result.ok([] as readonly ResolvedPackage[]),
            emptyReport
        );

        if (result.isErr) {
            assert.fail('expected an Ok result');
        }
        assert.deepStrictEqual(result.value, []);
    });
});
