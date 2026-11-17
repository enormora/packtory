import assert from 'node:assert';
import { suite, test } from 'mocha';
import { continuousIntegrationRunsPath, createBaseRoutes } from '../test-libraries/github-release-gate-test-support.ts';
import { runGetMainContinuousIntegrationRunStatus } from '../test-libraries/release-gate-request-fixtures.ts';

const workflowPath = '/repos/enormora/packtory/actions/workflows/continuous-integration.yml';

suite('release gate workflow validation', function () {
    for (
        const scenario of [ {
            name: 'missing workflow even when the runs endpoint returns an empty list',
            body: {
                message: 'Not Found'
            },
            status: 404,
            error:
                'GitHub API request failed (404) for /repos/enormora/packtory/actions/workflows/continuous-integration.yml'
        }, {
            name: 'renamed workflow',
            body: {
                path: '.github/workflows/renamed.yml',
                state: 'active'
            },
            status: 200,
            error:
                'Invalid CI workflow continuous-integration.yml: expected active .github/workflows/continuous-integration.yml, got active .github/workflows/renamed.yml'
        }, {
            name: 'disabled workflow',
            body: {
                path: '.github/workflows/continuous-integration.yml',
                state: 'disabled_manually'
            },
            status: 200,
            error:
                'Invalid CI workflow continuous-integration.yml: expected active .github/workflows/continuous-integration.yml, got disabled_manually .github/workflows/continuous-integration.yml'
        }, {
            name: 'deleted workflow whose runs endpoint returns an empty list',
            body: {
                path: '.github/workflows/continuous-integration.yml',
                state: 'deleted'
            },
            status: 200,
            error:
                'Invalid CI workflow continuous-integration.yml: expected active .github/workflows/continuous-integration.yml, got deleted .github/workflows/continuous-integration.yml'
        } ]
    ) {
        test(`CLI exits with failure for a ${scenario.name}`, async function () {
            const routes = {
                ...createBaseRoutes(),
                [workflowPath]: {
                    body: scenario.body,
                    status: scenario.status
                },
                [continuousIntegrationRunsPath]: {
                    body: {
                        workflow_runs: []
                    }
                }
            };
            await assert.rejects(runGetMainContinuousIntegrationRunStatus(routes), {
                message: scenario.error
            });
        });
    }
});
