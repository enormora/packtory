import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    parseCommandLineInterfacePacktoryConfig,
    resolveReleasePullRequestConfig
} from './release-pull-request-config.ts';

const packageAConfig = {
    name: 'package-a',
    sourcesFolder: 'source',
    mainPackageJson: { type: 'module' },
    roots: { main: { js: 'index.js' } }
} as const;

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
                        requiredStatusContexts: [ 'Node.js' ]
                    }
                }
            })
                .githubActionsCi,
            {
                deleteActionRequiredPullRequestRuns: true,
                requiredStatusContexts: [ 'Node.js' ],
                workflowFile: 'ci.yml'
            }
        );
    });

    test('parses release pull request settings from CLI config', function () {
        assert.deepStrictEqual(
            parseCommandLineInterfacePacktoryConfig({
                releasePullRequest: {
                    branch: 'release/pkg',
                    githubActionsCi: {
                        trigger: 'workflow-dispatch',
                        workflowFile: 'ci.yml',
                        requiredStatusContexts: [ 'Node.js v24.x' ]
                    }
                },
                packages: [ packageAConfig ]
            })
                ?.releasePullRequest,
            {
                branch: 'release/pkg',
                githubActionsCi: {
                    trigger: 'workflow-dispatch',
                    workflowFile: 'ci.yml',
                    requiredStatusContexts: [ 'Node.js v24.x' ]
                }
            }
        );
    });

    test('validates full CLI config with release pull request settings', function () {
        const result = parseCommandLineInterfacePacktoryConfig({
            packages: [ packageAConfig ],
            releasePullRequest: {
                branch: 'release/pkg',
                githubActionsCi: {
                    trigger: 'workflow-dispatch',
                    workflowFile: 'ci.yml',
                    requiredStatusContexts: [ 'Node.js v24.x' ]
                }
            }
        });

        assert.notStrictEqual(result, undefined);
    });

    test('rejects release CI without status contexts', function () {
        assert.strictEqual(
            parseCommandLineInterfacePacktoryConfig({
                packages: [ packageAConfig ],
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
