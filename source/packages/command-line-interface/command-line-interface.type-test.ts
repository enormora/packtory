import { describe, expect, test } from 'tstyche';
import type { PacktoryConfig } from './command-line-interface.entry-point.ts';

describe('PacktoryConfig', function () {
    test('accepts release pull request settings', function () {
        const config: PacktoryConfig = {
            packages: [
                {
                    name: 'package-a',
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    roots: { main: { js: 'index.js' } }
                }
            ],
            releasePullRequest: {
                automationAuthor: 'github-actions[bot]',
                body: 'Release body',
                branch: 'release/packtory',
                commitSubject: 'Release packages',
                defaultBranch: 'main',
                githubActionsCi: {
                    trigger: 'workflow-dispatch',
                    workflowFile: 'release.yml',
                    requiredStatusContexts: [ 'test' ],
                    deleteActionRequiredPullRequestRuns: false
                },
                label: 'release',
                title: 'Prepare release'
            }
        };

        expect(config).type.toBeAssignableTo<PacktoryConfig>();
    });

    test('exposes release pull request settings as a CLI config field', function () {
        expect<keyof PacktoryConfig>().type.toBe<
            'changelog' | 'checks' | 'commonPackageSettings' | 'packages' | 'registrySettings' | 'releasePullRequest'
        >();
    });
});
