import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createReleasePullRequestGitHubClient,
    type ReleasePullRequestGitHubClient
} from '../command-line-interface/runner/release-pr-github-client.ts';
import {
    createFakeGitHubActionsApi,
    type FakeGitHubActionsApi,
    type FakeGitHubWorkflowJob
} from './fake-github-actions-api.ts';

const workflow = { id: 101, name: 'ci', path: '.github/workflows/ci.yml' };
const successfulJob: FakeGitHubWorkflowJob = {
    conclusion: 'success',
    name: 'Node.js',
    status: 'completed',
    url: 'https://github.example/run/jobs/1'
};

function createClient(fetchImplementation: typeof globalThis.fetch): ReleasePullRequestGitHubClient {
    return createReleasePullRequestGitHubClient({
        fetch: fetchImplementation,
        owner: 'owner',
        repo: 'repo',
        token: 'token'
    });
}

function createPopulatedGitHub(): FakeGitHubActionsApi {
    const github = createFakeGitHubActionsApi();
    github.addWorkflow(workflow);
    github.addRun({
        conclusion: 'success',
        event: 'workflow_dispatch',
        headSha: 'release-head',
        id: 1,
        jobs: [ successfulJob ],
        status: 'completed',
        url: 'https://github.example/run/1',
        workflowId: workflow.id
    });
    github.addRun({
        conclusion: 'action_required',
        event: 'pull_request',
        headSha: 'release-head',
        id: 2,
        jobs: [],
        status: 'completed',
        url: 'https://github.example/run/2',
        workflowId: workflow.id
    });
    return github;
}

suite('fake-github-actions-api', function () {
    test('models workflow dispatches, workflow runs, jobs, statuses, and deleted runs', async function () {
        const github = createPopulatedGitHub();
        const client = createClient(github.fetch);

        await client.dispatchWorkflow({ ref: 'release/packtory', workflowFile: 'ci.yml' });
        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci.yml'
            }),
            { event: 'workflow_dispatch', observedRunIds: [ 1 ], runId: 1 }
        );
        assert.deepStrictEqual(await client.readWorkflowRunResult(1), {
            conclusion: 'success',
            databaseId: 1,
            jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://github.example/run/jobs/1' } ],
            url: 'https://github.example/run/1'
        });
        await client.createStatus({
            commitSha: 'release-head',
            context: 'Node.js',
            description: 'passed',
            state: 'success',
            targetUrl: 'https://github.example/run/jobs/1'
        });
        await client.deleteActionRequiredPullRequestRuns({ branch: 'release/packtory', headSha: 'release-head' });

        assert.partialDeepStrictEqual(github, {
            commitStatuses: [
                {
                    context: 'Node.js',
                    description: 'passed',
                    sha: 'release-head',
                    state: 'success',
                    targetUrl: 'https://github.example/run/jobs/1'
                }
            ],
            deletedRunIds: [ 2 ],
            dispatchedWorkflowIds: [ workflow.id ]
        });
    });
});
