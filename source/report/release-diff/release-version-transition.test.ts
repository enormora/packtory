import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildReleaseVersionLabel, buildReleaseVersionTransition } from './release-version-transition.ts';

suite('release-version-transition', function () {
    suite('buildReleaseVersionTransition', function () {
        test('returns "(unpublished)" when neither a previous nor a chosen version is available', function () {
            assert.strictEqual(
                buildReleaseVersionTransition({ previousVersion: undefined, chosenVersion: undefined }),
                '(unpublished)'
            );
        });

        test('returns "(unpublished) -> X" when only a chosen version is recorded', function () {
            assert.strictEqual(
                buildReleaseVersionTransition({ previousVersion: undefined, chosenVersion: '1.0.0' }),
                '(unpublished) -> 1.0.0'
            );
        });

        test('returns "A -> B" when both a previous and chosen version are recorded', function () {
            assert.strictEqual(
                buildReleaseVersionTransition({ previousVersion: '1.2.3', chosenVersion: '1.3.0' }),
                '1.2.3 -> 1.3.0'
            );
        });
    });

    suite('buildReleaseVersionLabel', function () {
        test('returns "(unpublished)" when there is no previous version', function () {
            assert.strictEqual(buildReleaseVersionLabel({ previousVersion: undefined }), '(unpublished)');
        });

        test('returns the previous version string when set', function () {
            assert.strictEqual(buildReleaseVersionLabel({ previousVersion: '1.2.3' }), '1.2.3');
        });
    });
});
