import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    parseReleasePullRequestConfigContainer,
    resolveReleasePullRequestConfig
} from './release-pull-request-config.ts';

suite('release-pull-request-config', function () {
    test('uses defaults when release pull request settings are absent', function () {
        assert.deepStrictEqual(resolveReleasePullRequestConfig({}), {
            automationAuthor: 'github-actions[bot]',
            body: 'Updates changelogs for the next release.',
            branch: 'release/packtory',
            commitSubject: 'Release packages',
            defaultBranch: 'main',
            githubActionsCi: undefined,
            label: 'release',
            title: 'Prepare release'
        });
    });

    test('defaults pull request run cleanup for configured GitHub Actions CI', function () {
        assert.deepStrictEqual(
            resolveReleasePullRequestConfig({
                releasePullRequest: {
                    githubActionsCi: {
                        trigger: 'workflow-dispatch',
                        workflowFile: 'ci.yml',
                        requiredStatusContexts: ['Node.js']
                    }
                }
            }).githubActionsCi,
            {
                deleteActionRequiredPullRequestRuns: true,
                requiredStatusContexts: ['Node.js'],
                workflowFile: 'ci.yml'
            }
        );
    });

    test('parses release pull request settings from CLI config', function () {
        assert.deepStrictEqual(
            parseReleasePullRequestConfigContainer({
                releasePullRequest: {
                    branch: 'release/pkg',
                    githubActionsCi: {
                        trigger: 'workflow-dispatch',
                        workflowFile: 'ci.yml',
                        requiredStatusContexts: ['Node.js v24.x']
                    }
                },
                packages: []
            }),
            {
                releasePullRequest: {
                    branch: 'release/pkg',
                    githubActionsCi: {
                        trigger: 'workflow-dispatch',
                        workflowFile: 'ci.yml',
                        requiredStatusContexts: ['Node.js v24.x']
                    }
                }
            }
        );
    });

    test('rejects release CI without status contexts', function () {
        assert.strictEqual(
            parseReleasePullRequestConfigContainer({
                releasePullRequest: {
                    githubActionsCi: {
                        trigger: 'workflow-dispatch',
                        workflowFile: 'ci.yml',
                        requiredStatusContexts: []
                    }
                }
            }),
            undefined
        );
    });
});
