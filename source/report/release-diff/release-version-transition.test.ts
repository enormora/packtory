import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageReport } from '../aggregator/report-types.ts';
import { buildReleaseVersionLabel, buildReleaseVersionTransition } from './release-version-transition.ts';

function reportWithVersion(previousVersion: string | undefined, chosenVersion: string | undefined): PackageReport {
    if (chosenVersion === undefined) {
        return { decisions: {}, timings: {} };
    }
    return {
        decisions: {
            version: {
                previousVersion,
                chosenVersion,
                trigger: previousVersion === undefined ? 'initial' : 'auto-patch-bump'
            }
        },
        timings: {}
    };
}

suite('release-version-transition', function () {
    suite('buildReleaseVersionTransition', function () {
        test('returns "(unpublished)" when there are no version decisions at all', function () {
            assert.strictEqual(buildReleaseVersionTransition({ decisions: {}, timings: {} }), '(unpublished)');
        });

        test('returns "(unpublished) -> X" when only a chosen version is recorded', function () {
            assert.strictEqual(
                buildReleaseVersionTransition(reportWithVersion(undefined, '1.0.0')),
                '(unpublished) -> 1.0.0'
            );
        });

        test('returns "A -> B" when both a previous and chosen version are recorded', function () {
            assert.strictEqual(buildReleaseVersionTransition(reportWithVersion('1.2.3', '1.3.0')), '1.2.3 -> 1.3.0');
        });
    });

    suite('buildReleaseVersionLabel', function () {
        test('returns "(unpublished)" when there is no previous version', function () {
            assert.strictEqual(buildReleaseVersionLabel({ decisions: {}, timings: {} }), '(unpublished)');
            assert.strictEqual(buildReleaseVersionLabel(reportWithVersion(undefined, '1.0.0')), '(unpublished)');
        });

        test('returns the previous version string when set', function () {
            assert.strictEqual(buildReleaseVersionLabel(reportWithVersion('1.2.3', '1.2.3')), '1.2.3');
        });
    });
});
