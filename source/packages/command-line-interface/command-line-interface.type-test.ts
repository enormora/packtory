import { describe, expect, test } from 'tstyche';
import type { PacktoryConfiguration } from './command-line-interface.entry-point.ts';

describe('PacktoryConfiguration', function () {
    test('accepts release pull request settings', function () {
        const configuration: PacktoryConfiguration = {
            packages: [
                {
                    name: 'package-a',
                    sourcesFolder: 'source',
                    mainPackageManifest: { type: 'module' },
                    roots: { main: { javaScript: 'index.js' } }
                }
            ],
            releasePullRequest: {
                automationAuthor: 'github-actions[bot]',
                body: 'Release body',
                branch: 'release/packtory',
                commitSubject: 'Release packages',
                defaultBranch: 'main',
                githubActionsContinuousIntegration: {
                    trigger: 'workflow-dispatch',
                    workflowFile: 'release.yml',
                    requiredStatusContexts: [ 'test' ],
                    deleteActionRequiredPullRequestRuns: false
                },
                label: 'release',
                title: 'Prepare release'
            }
        };

        expect(configuration).type.toBeAssignableTo<PacktoryConfiguration>();
    });

    test('exposes release pull request settings as a CLI config field', function () {
        expect<keyof PacktoryConfiguration>().type.toBe<
            'changelog' | 'checks' | 'commonPackageSettings' | 'packages' | 'registrySettings' | 'releasePullRequest'
        >();
    });
});
