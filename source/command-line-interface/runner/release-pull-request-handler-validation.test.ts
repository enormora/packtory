import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    assertHandlerFailure,
    createDependencies,
    createGitHubEnvironment,
    createReleasePullRequestClient,
    createReleasePullRequestDetails,
    type CreatedReleasePullRequestDependencies
} from '../../test-libraries/release-pull-request-handler-test-support.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';
import {
    runReleasePullRequestHandler,
    type ReleasePullRequestHandlerDependencies
} from './release-pull-request-handler.ts';

type ValidateDependenciesInput = {
    readonly client: ReleasePullRequestGitHubClient | undefined;
    readonly eventName: string;
    readonly eventPayload: unknown;
};

function createValidateDependencies(input: ValidateDependenciesInput): CreatedReleasePullRequestDependencies {
    const commonDependencies: Partial<ReleasePullRequestHandlerDependencies> = {
        fileManager: createFakeFileManager({
            simulatedReadFileResponses: [ { value: JSON.stringify(input.eventPayload) } ]
        }),
        flags: { command: 'validate', releasePullRequestNumber: undefined },
        readEnvironmentVariable: createGitHubEnvironment({
            GITHUB_EVENT_NAME: input.eventName,
            GITHUB_EVENT_PATH: '/event.json'
        })
    };
    if (input.client === undefined) {
        return createDependencies(commonDependencies);
    }
    return createDependencies({
        ...commonDependencies,
        createReleasePullRequestGitHubClient: fake.returns(input.client)
    });
}

suite('release-pull-request-handler validation', function () {
    test('validate accepts a normal pull request without the release label', async function () {
        const { dependencies, log } = createValidateDependencies({
            eventName: 'pull_request',
            eventPayload: { pull_request: { number: 12 } },
            client: createReleasePullRequestClient({
                getPullRequestHead: fake.resolves({
                    author: 'maintainer',
                    changedFiles: [ 'src/index.ts' ],
                    headRef: 'feature',
                    labels: [ 'bug' ],
                    parentShas: [ 'branch-head' ],
                    subject: 'Fix bug',
                    title: 'Fix bug'
                })
            })
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
    });

    test('validate accepts a release pull request that follows the policy', async function () {
        const { dependencies, log } = createValidateDependencies({
            client: undefined,
            eventName: 'pull_request',
            eventPayload: { pull_request: { number: 12 } }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
    });

    test('validate rejects release pull requests that violate the policy', async function () {
        const { dependencies, log } = createValidateDependencies({
            eventName: 'pull_request',
            eventPayload: { pull_request: { number: 12 } },
            client: createReleasePullRequestClient({
                getPullRequestHead: fake.resolves({
                    author: 'github-actions[bot]',
                    changedFiles: [ 'src/index.ts' ],
                    headRef: 'release/packtory',
                    labels: [ 'release' ],
                    parentShas: [ 'main-head' ],
                    subject: 'Release packages',
                    title: 'Prepare release'
                })
            })
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'Unexpected release PR file change: src/index.ts');
    });

    test('validate rejects pull request events without a pull request number', async function () {
        for (const eventPayload of [ {}, { pull_request: {} } ]) {
            await assertHandlerFailure(
                createValidateDependencies({
                    client: undefined,
                    eventName: 'pull_request',
                    eventPayload
                }),
                'GitHub pull_request event payload is missing pull_request.number'
            );
        }
    });

    test('validate accepts a merge group that contains only the release pull request', async function () {
        const { dependencies, log } = createValidateDependencies({
            eventName: 'merge_group',
            eventPayload: { merge_group: { base_sha: 'main-head', head_sha: 'merge-group-head' } },
            client: createReleasePullRequestClient({
                listCommitPullRequests: fake.resolves([ createReleasePullRequestDetails() ])
            })
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
    });

    test('validate rejects merge group events without merge group SHAs', async function () {
        for (
            const eventPayload of [
                {},
                { merge_group: {} },
                { merge_group: { base_sha: 'main-head' } },
                { merge_group: { head_sha: 'merge-group-head' } }
            ]
        ) {
            await assertHandlerFailure(
                createValidateDependencies({
                    client: undefined,
                    eventName: 'merge_group',
                    eventPayload
                }),
                'GitHub merge_group event payload is missing merge group SHAs'
            );
        }
    });

    test('validate rejects unsupported GitHub events', async function () {
        const { dependencies, log } = createValidateDependencies({
            client: undefined,
            eventName: 'push',
            eventPayload: {}
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(
            log.lastCall.args[0],
            'release-pr validate only supports pull_request and merge_group events'
        );
    });

    test('validate rejects non-object GitHub event payloads', async function () {
        for (const eventPayload of [ null, 'not an event' ]) {
            await assertHandlerFailure(
                createValidateDependencies({
                    client: undefined,
                    eventName: 'pull_request',
                    eventPayload
                }),
                'GitHub event payload must be an object'
            );
        }
    });
});
