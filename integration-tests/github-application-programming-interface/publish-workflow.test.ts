import assert from 'node:assert';
import fileSystem from 'node:fs';
import path from 'node:path';
import { suite, test } from 'mocha';
import { parse } from 'yaml';
import { z } from 'zod/mini';
import { createFileManager } from '../../source/file-manager/file-manager.ts';
import {
    createBaseRoutes,
    runEntryPointScript,
    withGitHubApplicationProgrammingInterfaceServer
} from '../../source/test-libraries/github-release-gate-test-support.ts';
import { readGitHubReleaseGateRunnerConfiguration } from '../../source/github-release-gate/runner-configuration.ts';

const workflowSchema = z.object({
    jobs: z.object({
        'evaluate-gate': z.looseObject({
            permissions: z.object({ actions: z.literal('read') }),
            steps: z.array(z.record(z.string(), z.unknown()))
        })
    })
});
const gateStepSchema = z.object({
    run: z.string(),
    env: z.strictObject({
        CHECKED_OUT_HEAD_HASH: z.string().check(z.regex(/^\$\{\{ steps\.main-head\.outputs\.main_head_sha \}\}$/u)),
        CI_WORKFLOW_FILE: z.string(),
        DEFAULT_BRANCH: z.string(),
        DEPENDENCY_ONLY_MINIMUM_AGE_DAYS: z.string(),
        GITHUB_TOKEN: z.string().check(z.regex(/^\$\{\{ github\.token \}\}$/u)),
        MAXIMUM_LATENCY_HOURS: z.string(),
        QUIET_PERIOD_MINUTES: z.string()
    })
});

async function readGateStep(): Promise<z.infer<typeof gateStepSchema>> {
    const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });
    const content = await fileManager.readFile('.github/workflows/publish.yml');
    const workflow = workflowSchema.parse(parse(content));
    const job = workflow.jobs['evaluate-gate'];
    const gateStep = job.steps.find(function (step) {
        return step.id === 'release-gate';
    });
    assert.strictEqual(job['continue-on-error'], undefined);
    assert.strictEqual(gateStep?.['continue-on-error'], undefined);
    return gateStepSchema.parse(gateStep);
}

suite('publish workflow release gate contract', function () {
    test('uses an existing CI workflow that runs on pushes to the configured branch', async function () {
        const step = await readGateStep();
        const configuration = readGitHubReleaseGateRunnerConfiguration(function (name) {
            return { ...step.env, GITHUB_REPOSITORY: 'enormora/packtory', GITHUB_OUTPUT: 'output' }[name];
        });
        const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });
        const content = await fileManager.readFile(
            path.join('.github/workflows', configuration.continuousIntegrationWorkflowFile)
        );
        const continuousIntegration = z
            .object({
                on: z.object({ push: z.object({ branches: z.array(z.string()) }) })
            })
            .parse(parse(content));

        assert.ok(continuousIntegration.on.push.branches.includes(configuration.defaultBranch));
        assert.partialDeepStrictEqual(configuration, {
            dependencyOnlyMinimumAgeDays: Number(step.env.DEPENDENCY_ONLY_MINIMUM_AGE_DAYS),
            maximumLatencyHours: Number(step.env.MAXIMUM_LATENCY_HOURS)
        });
    });

    for (
        const scenario of [
            {
                name: 'defers while CI has no runs',
                head: 'abc123',
                state: 'active',
                exitCode: 0,
                output: /reason=ci_not_green/u
            },
            {
                name: 'fails for a disabled CI workflow',
                head: 'abc123',
                state: 'disabled_inactivity',
                exitCode: 1,
                output: /Invalid CI workflow/u
            },
            {
                name: 'fails for a stale checkout',
                head: 'different-head',
                state: 'active',
                exitCode: 1,
                output: /Checked-out commit different-head differs/u
            }
        ]
    ) {
        test(`actual compiled gate command ${scenario.name}`, async function () {
            const step = await readGateStep();
            assert.match(step.run, /^node \.\/target\/build\/source\/.+\.js$/u);
            await withGitHubApplicationProgrammingInterfaceServer({
                ...createBaseRoutes(),
                '/repos/enormora/packtory/actions/workflows/continuous-integration.yml': {
                    body: { path: '.github/workflows/continuous-integration.yml', state: scenario.state }
                },
                '/repos/enormora/packtory/actions/workflows/continuous-integration.yml/runs?branch=main&event=push&head_sha=abc123&per_page=100':
                    {
                        body: { workflow_runs: [] }
                    }
            }, async function (applicationProgrammingInterfaceBaseAddress) {
                const result = await runEntryPointScript(step.run.slice('node '.length), {
                    ...step.env,
                    CHECKED_OUT_HEAD_HASH: scenario.head,
                    GITHUB_API_BASE_URL: applicationProgrammingInterfaceBaseAddress,
                    GITHUB_REPOSITORY: 'enormora/packtory',
                    GITHUB_TOKEN: 'token'
                });

                assert.strictEqual(result.exitCode, scenario.exitCode);
                assert.match(result.output, scenario.output);
            });
        });
    }
});
