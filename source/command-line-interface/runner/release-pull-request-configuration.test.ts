import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    parseCommandLineInterfacePacktoryConfiguration,
    resolveReleasePullRequestConfiguration
} from './release-pull-request-configuration.ts';

const packageAConfiguration = {
    name: 'package-a',
    sourcesFolder: 'source',
    mainPackageManifest: { type: 'module' },
    roots: { main: { javaScript: 'index.js' } }
} as const;

suite('release-pull-request-config', function () {
    test('uses defaults when release pull request settings are absent', function () {
        assert.deepStrictEqual(resolveReleasePullRequestConfiguration({}), {
            automationAuthor: 'github-actions[bot]',
            body: 'Updates changelogs for the next release.',
            branch: 'release/packtory',
            commitSubject: 'Release packages',
            defaultBranch: 'main',
            githubActionsContinuousIntegration: undefined,
            label: 'release',
            title: 'Prepare release'
        });
    });

    test('defaults pull request run cleanup for configured GitHub Actions CI', function () {
        assert.deepStrictEqual(
            resolveReleasePullRequestConfiguration({
                releasePullRequest: {
                    githubActionsContinuousIntegration: {
                        trigger: 'workflow-dispatch',
                        workflowFile: 'continuous-integration.yml',
                        requiredStatusContexts: [ 'Node.js' ]
                    }
                }
            })
                .githubActionsContinuousIntegration,
            {
                deleteActionRequiredPullRequestRuns: true,
                requiredStatusContexts: [ 'Node.js' ],
                workflowFile: 'continuous-integration.yml'
            }
        );
    });

    test('parses release pull request settings from CLI config', function () {
        assert.deepStrictEqual(
            parseCommandLineInterfacePacktoryConfiguration({
                releasePullRequest: {
                    branch: 'release/package',
                    githubActionsContinuousIntegration: {
                        trigger: 'workflow-dispatch',
                        workflowFile: 'continuous-integration.yml',
                        requiredStatusContexts: [ 'Node.js v24.x' ]
                    }
                },
                packages: [ packageAConfiguration ]
            })
                ?.releasePullRequest,
            {
                branch: 'release/package',
                githubActionsContinuousIntegration: {
                    trigger: 'workflow-dispatch',
                    workflowFile: 'continuous-integration.yml',
                    requiredStatusContexts: [ 'Node.js v24.x' ]
                }
            }
        );
    });

    test('validates full CLI config with release pull request settings', function () {
        const result = parseCommandLineInterfacePacktoryConfiguration({
            packages: [ packageAConfiguration ],
            releasePullRequest: {
                branch: 'release/package',
                githubActionsContinuousIntegration: {
                    trigger: 'workflow-dispatch',
                    workflowFile: 'continuous-integration.yml',
                    requiredStatusContexts: [ 'Node.js v24.x' ]
                }
            }
        });

        assert.notStrictEqual(result, undefined);
    });

    test('rejects release CI without status contexts', function () {
        assert.strictEqual(
            parseCommandLineInterfacePacktoryConfiguration({
                packages: [ packageAConfiguration ],
                releasePullRequest: {
                    githubActionsContinuousIntegration: {
                        trigger: 'workflow-dispatch',
                        workflowFile: 'continuous-integration.yml',
                        requiredStatusContexts: []
                    }
                }
            }),
            undefined
        );
    });
});
