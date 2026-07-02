import { suite, test } from 'mocha';
import {
    assertFailureLog,
    createCurrentHeadRetryPackage,
    createReleasePlanOutcomesForPackage,
    githubReleaseFlags
} from '../../test-libraries/release-handler-test-support.ts';

suite('GitHub release validation', function () {
    test('rejects GitHub releases without a GitHub token', async function () {
        await assertFailureLog(
            {
                flags: githubReleaseFlags,
                readEnvironmentVariable() {
                    return undefined;
                },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /GH_TOKEN or GITHUB_TOKEN/u
        );
    });

    test('rejects GitHub releases when package metadata is not a GitHub repository', async function () {
        await assertFailureLog(
            {
                flags: githubReleaseFlags,
                async readPackageInfo() {
                    return { repository: { url: 'https://example.com/owner/repo' } };
                },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /package\.json repository/u
        );
    });

    test('rejects GitHub repositories with extra path segments', async function () {
        await assertFailureLog(
            {
                flags: githubReleaseFlags,
                async readPackageInfo() {
                    return { repository: { url: 'https://github.com/enormora/packtory/extra' } };
                },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /package\.json repository/u
        );
    });

    test('rejects GitHub repositories with non-URL prefixes', async function () {
        await assertFailureLog(
            {
                flags: githubReleaseFlags,
                async readPackageInfo() {
                    return { repository: { url: 'prefixhttps://github.com/enormora/packtory' } };
                },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /package\.json repository/u
        );
    });

    test('rejects changelog generation when the config cannot be parsed', async function () {
        await assertFailureLog(
            {
                config: { packages: [] },
                flags: { writeChangelog: true, noDryRun: true }
            },
            /invalid for changelog generation/u
        );
    });

    test('rejects GitHub release notes when the config cannot be parsed', async function () {
        await assertFailureLog(
            {
                config: { packages: [] },
                flags: githubReleaseFlags,
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            },
            /invalid for changelog generation/u
        );
    });
});
