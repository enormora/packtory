import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    findWorkflowRunIdInRuns,
    observedWorkflowRunIds,
    selectReleaseWorkflow,
    workflowMatchesIdentifier,
    type ReleaseWorkflow
} from './release-pr-workflow-runs.ts';

const workflow: ReleaseWorkflow = {
    id: 101,
    name: 'Continuous Integration',
    path: '.github/workflows/continuous-integration.yml'
};

suite('release-pr-workflow-runs', function () {
    test('matches workflows by id, name, path, and basename', function () {
        assert.strictEqual(workflowMatchesIdentifier(workflow, '101'), true);
        assert.strictEqual(workflowMatchesIdentifier(workflow, 'Continuous Integration'), true);
        assert.strictEqual(workflowMatchesIdentifier(workflow, '.github/workflows/continuous-integration.yml'), true);
        assert.strictEqual(workflowMatchesIdentifier(workflow, 'continuous-integration.yml'), true);
        assert.strictEqual(workflowMatchesIdentifier(workflow, 'other.yml'), false);
    });

    test('selects exactly one release workflow', function () {
        assert.deepStrictEqual(selectReleaseWorkflow('continuous-integration.yml', [workflow]), workflow);
    });

    test('fails when no release workflow matches the identifier', function () {
        assert.throws(() => {
            selectReleaseWorkflow('missing.yml', []);
        }, /GitHub Actions workflow "missing\.yml" was not found/u);
    });

    test('fails when multiple release workflows match the identifier', function () {
        assert.throws(() => {
            selectReleaseWorkflow('ci.yml', [
                { id: 101, name: 'CI', path: '.github/workflows/ci.yml' },
                { id: 102, name: 'CI copy', path: '.github/workflows/ci.yml' }
            ]);
        }, /GitHub Actions workflow "ci\.yml" matched multiple workflows/u);
    });

    test('finds matching workflow dispatch runs by workflow identity and head SHA', function () {
        assert.strictEqual(
            findWorkflowRunIdInRuns(
                [
                    {
                        database_id: 1,
                        event: 'workflow_dispatch',
                        head_sha: 'other-head',
                        workflow_id: 101
                    },
                    {
                        databaseId: 2,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        name: 'Continuous Integration',
                        path: 'enormora/packtory/.github/workflows/continuous-integration.yml',
                        workflow_id: 101
                    }
                ],
                workflow,
                'release-head'
            ),
            2
        );
    });

    test('ignores matching workflow runs from other events', function () {
        assert.strictEqual(
            findWorkflowRunIdInRuns(
                [
                    {
                        database_id: 1,
                        event: 'pull_request',
                        head_sha: 'release-head',
                        name: 'Continuous Integration',
                        path: 'enormora/packtory/.github/workflows/continuous-integration.yml',
                        workflow_id: 101
                    }
                ],
                workflow,
                'release-head'
            ),
            undefined
        );
    });

    test('ignores newer workflow dispatch runs with mismatched workflow identity fields', function () {
        assert.strictEqual(
            findWorkflowRunIdInRuns(
                [
                    {
                        database_id: 20,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        name: 'Continuous Integration',
                        path: 'enormora/packtory/.github/workflows/continuous-integration.yml',
                        workflow_id: 101
                    },
                    {
                        database_id: 23,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        name: 'Continuous Integration',
                        path: 'enormora/packtory/.github/workflows/continuous-integration.yml',
                        workflow_id: 102
                    },
                    {
                        database_id: 22,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        name: 'Continuous Integration',
                        path: 'enormora/packtory/.github/workflows/other.yml',
                        workflow_id: 101
                    },
                    {
                        database_id: 21,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        name: 'Other CI',
                        path: 'enormora/packtory/.github/workflows/continuous-integration.yml',
                        workflow_id: 101
                    }
                ],
                workflow,
                'release-head'
            ),
            20
        );
    });

    test('chooses the newest matching workflow dispatch run for a head SHA', function () {
        assert.strictEqual(
            findWorkflowRunIdInRuns(
                [
                    {
                        database_id: 10,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        workflow_id: 101
                    },
                    {
                        database_id: 12,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        workflow_id: 101
                    }
                ],
                workflow,
                'release-head'
            ),
            12
        );
    });

    test('keeps the first matching workflow dispatch run when later matches are older or missing ids', function () {
        assert.strictEqual(
            findWorkflowRunIdInRuns(
                [
                    {
                        database_id: 12,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        workflow_id: 101
                    },
                    {
                        database_id: 10,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        workflow_id: 101
                    },
                    {
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        workflow_id: 101
                    }
                ],
                workflow,
                'release-head'
            ),
            12
        );
    });

    test('replaces a matching workflow dispatch run without an id when a newer identified run appears', function () {
        assert.strictEqual(
            findWorkflowRunIdInRuns(
                [
                    {
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        workflow_id: 101
                    },
                    {
                        database_id: 12,
                        event: 'workflow_dispatch',
                        head_sha: 'release-head',
                        workflow_id: 101
                    }
                ],
                workflow,
                'release-head'
            ),
            12
        );
    });

    test('collects defined workflow run ids', function () {
        assert.deepStrictEqual(
            observedWorkflowRunIds([
                { database_id: 1, event: 'workflow_dispatch', head_sha: 'release-head' },
                { event: 'workflow_dispatch', head_sha: 'release-head' },
                { databaseId: 2, event: 'workflow_dispatch', head_sha: 'release-head' }
            ]),
            [1, 2]
        );
    });
});
