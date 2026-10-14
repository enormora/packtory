import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    assertBranchHeadUsesApplicationProgrammingInterfaceBaseAddress,
    assertBranchWasDeleted,
    countReleasePullRequestLookups,
    createDeleteReleaseBranchClient,
    createFetch
} from '../../test-libraries/release-github-response-fixtures.ts';
import {
    captureRequests,
    createClient,
    createPullRequest,
    createRecordedRouteFetch,
    emptyResponse,
    hasRequestWithBody,
    javaScriptObjectNotationResponse,
    readHeader,
    requestHasSearchParameter,
    routeKey
} from '../../test-libraries/release-pull-request-github-client-test-support.ts';

suite('release-pull-request-github-client', function () {
    test('uses the default GitHub API base URL', async function () {
        await assertBranchHeadUsesApplicationProgrammingInterfaceBaseAddress(
            'https://api.github.com',
            'https://api.github.com/repos/owner/repo/branches/main'
        );
    });

    test('uses the configured GitHub API base URL', async function () {
        await assertBranchHeadUsesApplicationProgrammingInterfaceBaseAddress(
            'http://127.0.0.1:1234',
            'http://127.0.0.1:1234/repos/owner/repo/branches/main'
        );
    });

    test('maintains release pull requests', async function () {
        const capturedRequests = captureRequests();
        const client = createClient(createFetch(capturedRequests));

        await client.closeOpenReleasePullRequests({ baseBranch: 'main', releaseBranch: 'release/packtory' });
        await client.deleteBranch('release/packtory');
        assert.deepStrictEqual(
            await client.createOrUpdateReleasePullRequest({
                baseBranch: 'main',
                body: 'Body',
                label: 'release',
                releaseBranch: 'release/packtory',
                title: 'Prepare release'
            }),
            1
        );
        assert.strictEqual(countReleasePullRequestLookups(capturedRequests.records), 2);
        assert.strictEqual(
            hasRequestWithBody(capturedRequests.records, 'PATCH', '/repos/owner/repo/pulls/1', '"state":"closed"'),
            true
        );
        assert.strictEqual(
            hasRequestWithBody(capturedRequests.records, 'PUT', '/repos/owner/repo/issues/1/labels', '"release"'),
            true
        );
        assert.strictEqual(
            readHeader(capturedRequests.records[0]?.headers, 'user-agent'),
            'packtory-release-pull-request'
        );
    });

    suite('release branch deletion', function () {
        test('treats not found release branch deletion as a no-op', async function () {
            const capturedRequests = captureRequests();
            const client = createDeleteReleaseBranchClient(
                capturedRequests,
                function () {
                    return emptyResponse(404);
                }
            );

            await client.deleteBranch('release/packtory');
            assertBranchWasDeleted(capturedRequests.records);
        });

        test('treats missing reference release branch deletion as a no-op', async function () {
            const capturedRequests = captureRequests();
            const client = createDeleteReleaseBranchClient(
                capturedRequests,
                function () {
                    return javaScriptObjectNotationResponse({ message: 'Reference does not exist' }, 422);
                }
            );

            await client.deleteBranch('release/packtory');
            assertBranchWasDeleted(capturedRequests.records);
        });

        test('fails release branch deletion for other GitHub API errors', async function () {
            const client = createDeleteReleaseBranchClient(
                captureRequests(),
                function () {
                    return javaScriptObjectNotationResponse({ message: 'Branch cannot be deleted' }, 422);
                }
            );

            await assert.rejects(
                client.deleteBranch('release/packtory'),
                /GitHub API request failed \(422\) for \/repos\/owner\/repo\/git\/refs\/heads%2Frelease%2Fpacktory/u
            );
        });

        test('fails release branch deletion for missing reference messages with other statuses', async function () {
            const client = createDeleteReleaseBranchClient(
                captureRequests(),
                function () {
                    return javaScriptObjectNotationResponse({ message: 'Reference does not exist' }, 500);
                }
            );

            await assert.rejects(
                client.deleteBranch('release/packtory'),
                /GitHub API request failed \(500\) for \/repos\/owner\/repo\/git\/refs\/heads%2Frelease%2Fpacktory/u
            );
        });
    });

    test('writes statuses and dispatches workflows', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        await client.createStatus({
            commitHash: 'release-head',
            context: 'Node.js',
            description: 'pending',
            state: 'pending',
            targetAddress: undefined
        });
        await client.createStatus({
            commitHash: 'release-head',
            context: 'Node.js',
            description: 'success',
            state: 'success',
            targetAddress: 'https://run/job'
        });
        await client.dispatchWorkflow({ reference: 'release/packtory', workflowFile: 'continuous-integration.yml' });

        assert.strictEqual(
            hasRequestWithBody(records, 'POST', '/repos/owner/repo/statuses/release-head', '"target_url":null'),
            true
        );
        assert.strictEqual(
            hasRequestWithBody(
                records,
                'POST',
                '/repos/owner/repo/statuses/release-head',
                '"target_url":"https://run/job"'
            ),
            true
        );
        assert.strictEqual(
            hasRequestWithBody(
                records,
                'POST',
                '/repos/owner/repo/actions/workflows/101/dispatches',
                '"ref":"release/packtory"'
            ),
            true
        );
    });

    test('finds dispatched workflow runs and branch heads', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headHash: 'release-head',
                workflowFile: 'continuous-integration.yml'
            }),
            { event: 'workflow_dispatch', observedRunIdentifiers: [ 11 ], runIdentifier: 11 }
        );
        const missingRunLookup = await client.findDispatchedWorkflowRun({
            branch: 'release/packtory',
            headHash: 'missing-head',
            workflowFile: 'continuous-integration.yml'
        });
        assert.strictEqual(missingRunLookup.runIdentifier, undefined);
        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headHash: 'release-head',
                workflowFile: 'ci-db.yml'
            }),
            { event: 'workflow_dispatch', observedRunIdentifiers: [ 12 ], runIdentifier: 12 }
        );
        assert.strictEqual(await client.getBranchHeadHash('main'), 'main-head');
        assert.ok(records.some(function (record) {
            return (
                record.path === '/repos/owner/repo/actions/workflows/101/runs' &&
                requestHasSearchParameter(record, 'event', 'workflow_dispatch')
            );
        }));
    });

    test('finds dispatched workflow runs through the repository fallback when workflow runs lag', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(
            createRecordedRouteFetch(
                capturedRequests,
                new Map([
                    [ routeKey('GET', '/repos/owner/repo/actions/workflows'), function () {
                        return javaScriptObjectNotationResponse({
                            workflows: [ {
                                identifier: 101,
                                name: 'ci',
                                path: '.github/workflows/continuous-integration.yml'
                            } ]
                        });
                    } ],
                    [ routeKey('GET', '/repos/owner/repo/actions/workflows/101/runs'), function () {
                        return javaScriptObjectNotationResponse({
                            workflow_runs: [
                                { database_id: 21, event: 'workflow_dispatch', head_sha: 'other-head' }
                            ]
                        });
                    } ],
                    [ routeKey('GET', '/repos/owner/repo/actions/runs'), function () {
                        return javaScriptObjectNotationResponse({
                            workflow_runs: [
                                { database_id: 22, event: 'workflow_dispatch', head_sha: 'release-head' }
                            ]
                        });
                    } ]
                ])
            )
        );

        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headHash: 'release-head',
                workflowFile: 'continuous-integration.yml'
            }),
            { event: 'workflow_dispatch', observedRunIdentifiers: [ 21, 22 ], runIdentifier: 22 }
        );
        assert.ok(records.some(function (record) {
            return (
                record.path === '/repos/owner/repo/actions/runs' &&
                requestHasSearchParameter(record, 'event', 'workflow_dispatch')
            );
        }));
    });

    test('reads release pull request metadata', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        assert.deepStrictEqual(await client.getPullRequestHead(12), {
            author: 'github-actions[bot]',
            changedFiles: [ 'CHANGELOG.md' ],
            headReference: 'release/packtory',
            labels: [ 'release' ],
            parentHashes: [ 'main-head' ],
            subject: 'Release packages',
            title: 'Prepare release'
        });
        const pullRequest = await client.getPullRequest(12);
        const commitPullRequests = await client.listCommitPullRequests('merge-sha');
        assert.partialDeepStrictEqual(pullRequest, {
            number: 12,
            merged: true
        });
        assert.strictEqual(commitPullRequests[0]?.number, 12);
        assert.strictEqual(records.length > 0, true);
    });

    test('reads workflow run results and deletes blocked runs', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const client = createClient(createFetch(capturedRequests));

        await client.deleteActionRequiredPullRequestRuns({ branch: 'release/packtory', headHash: 'release-head' });
        assert.deepStrictEqual(await client.readWorkflowRunResult(11), {
            conclusion: 'success',
            databaseIdentifier: 11,
            jobs: [ { conclusion: 'success', name: 'Node.js', address: 'https://run/job' } ],
            address: undefined
        });
        assert.deepStrictEqual(await client.readWorkflowRunResult(12), {
            conclusion: undefined,
            databaseIdentifier: 12,
            jobs: [ { conclusion: undefined, name: 'Node.js', address: undefined } ],
            address: undefined
        });
        assert.deepStrictEqual(
            records
                .filter(function (record) {
                    return record.method === 'DELETE';
                })
                .map(function (record) {
                    return record.path;
                }),
            [
                '/repos/owner/repo/actions/runs/10',
                '/repos/owner/repo/actions/runs/14',
                '/repos/owner/repo/actions/runs/15',
                '/repos/owner/repo/actions/runs/17'
            ]
        );
        assert.ok(records.some(function (record) {
            return (
                record.path === '/repos/owner/repo/actions/runs' &&
                requestHasSearchParameter(record, 'event', 'pull_request')
            );
        }));
    });

    test('creates a release pull request when no open release pull request exists', async function () {
        const capturedRequests = captureRequests();
        const { records } = capturedRequests;
        const fetchMock = createRecordedRouteFetch(
            capturedRequests,
            new Map([
                [ routeKey('GET', '/repos/owner/repo/pulls'), function () {
                    return javaScriptObjectNotationResponse([]);
                } ],
                [ routeKey('POST', '/repos/owner/repo/pulls'), function () {
                    return javaScriptObjectNotationResponse(createPullRequest(2));
                } ],
                [ routeKey('PUT', '/repos/owner/repo/issues/2/labels'), function () {
                    return javaScriptObjectNotationResponse([ { name: 'release' } ]);
                } ]
            ])
        );
        const client = createClient(fetchMock);

        assert.strictEqual(
            await client.createOrUpdateReleasePullRequest({
                baseBranch: 'main',
                body: 'Body',
                label: 'release',
                releaseBranch: 'release/packtory',
                title: 'Prepare release'
            }),
            2
        );
        assert.strictEqual(
            records.some(function (record) {
                return record.method === 'POST' && record.path === '/repos/owner/repo/pulls';
            }),
            true
        );
    });
});
