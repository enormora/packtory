import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    assertRepositoryCoherence,
    getContinuousIntegrationRepositoryAddress,
    readContinuousIntegrationEnvironment,
    type ContinuousIntegrationEnvironment
} from './repository-coherence.ts';
import { normalizeRepositoryAddress } from './repository-address-normalizer.ts';

const expectedNoRepositoryDeclaredMessage = 'Provenance is enabled but the package has no repository declared.\n' +
    'Add a "repository" entry to additionalPackageManifestAttributes\n' +
    "so consumers can verify the attestation's source claim.";

const expectedNoContinuousIntegrationDetectedMessage =
    'Provenance auto mode is enabled but no CI repository was detected.\n' +
    'Provenance auto mode requires GitHub Actions or GitLab CI; expected\n' +
    'one of GITHUB_SERVER_URL+GITHUB_REPOSITORY or CI_PROJECT_URL.';

function buildExpectedMismatchMessage(configuredAddress: string, continuousIntegrationAddress: string): string {
    return (
        "Provenance is enabled but the package's repository URL does not match\n" +
        'the CI repository.\n' +
        `Configured repository: ${configuredAddress}\n` +
        `CI repository:         ${continuousIntegrationAddress}\n` +
        'Either correct the package.json repository field, or disable provenance\n' +
        'if the mismatch is intentional.'
    );
}

function captureError(runRepositoryCoherenceAssertion: () => void): unknown {
    try {
        runRepositoryCoherenceAssertion();
    } catch (caughtError: unknown) {
        return caughtError;
    }

    return undefined;
}

function assertThrowsMessage(runRepositoryCoherenceAssertion: () => void, expectedMessage: string): void {
    const error = captureError(runRepositoryCoherenceAssertion);

    assert.ok(error instanceof Error);
    assert.strictEqual(error.message, expectedMessage);
}

suite('repository-coherence', function () {
    suite('invalid repository urls', function () {
        test('normalizeRepositoryAddress() returns undefined for undefined input', function () {
            assert.strictEqual(normalizeRepositoryAddress(undefined), undefined);
        });

        test('normalizeRepositoryAddress() returns undefined for an empty string', function () {
            assert.strictEqual(normalizeRepositoryAddress(''), undefined);
        });

        test('normalizeRepositoryAddress() returns undefined for null input', function () {
            assert.strictEqual(normalizeRepositoryAddress(null), undefined);
        });

        test('normalizeRepositoryAddress() returns undefined for numeric input', function () {
            assert.strictEqual(normalizeRepositoryAddress(42), undefined);
        });

        test('normalizeRepositoryAddress() returns undefined for an array input', function () {
            assert.strictEqual(normalizeRepositoryAddress([ 'https://github.com/foo/bar' ]), undefined);
        });

        test('normalizeRepositoryAddress() returns undefined for object input missing the url property', function () {
            assert.strictEqual(normalizeRepositoryAddress({ type: 'git' }), undefined);
        });

        test('normalizeRepositoryAddress() returns undefined for object input with an empty url property', function () {
            assert.strictEqual(normalizeRepositoryAddress({ url: '' }), undefined);
        });

        test('normalizeRepositoryAddress() returns undefined for object input with a non-string url property', function () {
            assert.strictEqual(normalizeRepositoryAddress({ url: 42 }), undefined);
        });
    });

    suite('hosted repository urls', function () {
        suite('GitHub urls', function () {
            test('normalizeRepositoryAddress() canonicalizes a plain https GitHub url', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://github.com/foo/bar'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() canonicalizes a https GitHub url with a .git suffix', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://github.com/foo/bar.git'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() canonicalizes a https GitHub url with a trailing slash', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://github.com/foo/bar/'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() canonicalizes a git+https GitHub url', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('git+https://github.com/foo/bar.git'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() canonicalizes a git+ssh GitHub url', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('git+ssh://git@github.com/foo/bar.git'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() canonicalizes an SCP-style GitHub url', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('git@github.com:foo/bar.git'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() canonicalizes an npm shorthand GitHub url', function () {
                assert.strictEqual(normalizeRepositoryAddress('github:foo/bar'), 'https://github.com/foo/bar');
            });
        });

        suite('GitLab urls', function () {
            test('normalizeRepositoryAddress() canonicalizes a https GitLab url', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://gitlab.com/foo/bar'),
                    'https://gitlab.com/foo/bar'
                );
            });
        });

        suite('object urls', function () {
            test('normalizeRepositoryAddress() canonicalizes the object form with a url property', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress({ type: 'git', url: 'git+ssh://git@github.com/foo/bar.git' }),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() lowercases mixed-case host and path', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://Github.com/Foo/Bar'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() drops a committish from a hosted GitHub url', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://github.com/foo/bar#main'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() ignores the directory field on the object form', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress({
                        type: 'git',
                        url: 'https://github.com/foo/bar',
                        directory: 'packages/inner'
                    }),
                    'https://github.com/foo/bar'
                );
            });
        });

        suite('self-hosted urls', function () {
            test('normalizeRepositoryAddress() falls back to manual normalization for self-hosted https urls', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://gitea.example.com/foo/bar.git'),
                    'https://gitea.example.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() strips a trailing slash for self-hosted urls', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://gitea.example.com/foo/bar/'),
                    'https://gitea.example.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() strips a git+ prefix for self-hosted urls', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('git+https://gitea.example.com/foo/bar.git'),
                    'https://gitea.example.com/foo/bar'
                );
            });

            test('normalizeRepositoryAddress() lowercases self-hosted urls', function () {
                assert.strictEqual(
                    normalizeRepositoryAddress('https://Gitea.Example.com/Foo/Bar'),
                    'https://gitea.example.com/foo/bar'
                );
            });
        });
    });

    suite('CI repository urls', function () {
        test('getContinuousIntegrationRepositoryAddress() returns undefined when no env vars are set', function () {
            const environment: ContinuousIntegrationEnvironment = {
                githubServerAddress: undefined,
                githubRepository: undefined,
                gitlabProjectAddress: undefined
            };

            assert.strictEqual(getContinuousIntegrationRepositoryAddress(environment), undefined);
        });

        test('getContinuousIntegrationRepositoryAddress() returns the GitHub Actions repository url when both GHA env vars are set', function () {
            const environment: ContinuousIntegrationEnvironment = {
                githubServerAddress: 'https://github.com',
                githubRepository: 'enormora/packtory',
                gitlabProjectAddress: undefined
            };

            assert.strictEqual(
                getContinuousIntegrationRepositoryAddress(environment),
                'https://github.com/enormora/packtory'
            );
        });

        test('getContinuousIntegrationRepositoryAddress() returns the GitLab CI repository url when only the GitLab var is set', function () {
            const environment: ContinuousIntegrationEnvironment = {
                githubServerAddress: undefined,
                githubRepository: undefined,
                gitlabProjectAddress: 'https://gitlab.com/enormora/packtory'
            };

            assert.strictEqual(
                getContinuousIntegrationRepositoryAddress(environment),
                'https://gitlab.com/enormora/packtory'
            );
        });

        test('getContinuousIntegrationRepositoryAddress() prefers GitHub Actions over GitLab when both are set', function () {
            const environment: ContinuousIntegrationEnvironment = {
                githubServerAddress: 'https://github.com',
                githubRepository: 'enormora/packtory',
                gitlabProjectAddress: 'https://gitlab.com/some/other'
            };

            assert.strictEqual(
                getContinuousIntegrationRepositoryAddress(environment),
                'https://github.com/enormora/packtory'
            );
        });

        test('getContinuousIntegrationRepositoryAddress() returns undefined when only GITHUB_SERVER_URL is set', function () {
            const environment: ContinuousIntegrationEnvironment = {
                githubServerAddress: 'https://github.com',
                githubRepository: undefined,
                gitlabProjectAddress: undefined
            };

            assert.strictEqual(getContinuousIntegrationRepositoryAddress(environment), undefined);
        });

        test('getContinuousIntegrationRepositoryAddress() returns undefined when only GITHUB_REPOSITORY is set', function () {
            const environment: ContinuousIntegrationEnvironment = {
                githubServerAddress: undefined,
                githubRepository: 'enormora/packtory',
                gitlabProjectAddress: undefined
            };

            assert.strictEqual(getContinuousIntegrationRepositoryAddress(environment), undefined);
        });

        test('getContinuousIntegrationRepositoryAddress() treats empty env values as not set', function () {
            const environment: ContinuousIntegrationEnvironment = {
                githubServerAddress: '',
                githubRepository: '',
                gitlabProjectAddress: ''
            };

            assert.strictEqual(getContinuousIntegrationRepositoryAddress(environment), undefined);
        });
    });

    suite('repository coherence assertions', function () {
        test('assertRepositoryCoherence() does not throw when the manifest matches the CI repository', function () {
            assertRepositoryCoherence(
                { repository: 'git+ssh://git@github.com/enormora/packtory.git' },
                'https://github.com/enormora/packtory'
            );

            assert.strictEqual(
                getContinuousIntegrationRepositoryAddress({
                    githubRepository: 'enormora/packtory',
                    githubServerAddress: 'https://github.com',
                    gitlabProjectAddress: ''
                }),
                'https://github.com/enormora/packtory'
            );
        });

        test('assertRepositoryCoherence() does not throw when the object form matches the CI repository', function () {
            assertRepositoryCoherence(
                { repository: { type: 'git', url: 'git+ssh://git@github.com/enormora/packtory.git' } },
                'https://github.com/enormora/packtory'
            );

            assert.strictEqual(
                normalizeRepositoryAddress('git+ssh://git@github.com/enormora/packtory.git'),
                'https://github.com/enormora/packtory'
            );
        });

        test('assertRepositoryCoherence() throws when the manifest repository differs from the CI repository', function () {
            assertThrowsMessage(
                function () {
                    assertRepositoryCoherence(
                        { repository: 'https://github.com/foo/forked-package' },
                        'https://github.com/upstream/package'
                    );
                },
                buildExpectedMismatchMessage(
                    'https://github.com/foo/forked-package',
                    'https://github.com/upstream/package'
                )
            );
        });

        test('assertRepositoryCoherence() throws the missing-repository error when the manifest has no repository', function () {
            assertThrowsMessage(
                function () {
                    assertRepositoryCoherence({}, 'https://github.com/enormora/packtory');
                },
                expectedNoRepositoryDeclaredMessage
            );
        });

        test('assertRepositoryCoherence() throws the missing-repository error when the repository is an unsupported value', function () {
            assertThrowsMessage(
                function () {
                    assertRepositoryCoherence({ repository: 42 }, 'https://github.com/enormora/packtory');
                },
                expectedNoRepositoryDeclaredMessage
            );
        });

        test('assertRepositoryCoherence() throws the missing-CI error when no CI repository url is provided', function () {
            assertThrowsMessage(
                function () {
                    assertRepositoryCoherence({ repository: 'https://github.com/enormora/packtory' }, undefined);
                },
                expectedNoContinuousIntegrationDetectedMessage
            );
        });
    });

    suite('CI environment reads', function () {
        test('readContinuousIntegrationEnvironment() reads GitHub Actions, GitLab CI, and missing env vars from the given env', function () {
            const environment: ContinuousIntegrationEnvironment = readContinuousIntegrationEnvironment({
                GITHUB_SERVER_URL: 'https://github.com',
                GITHUB_REPOSITORY: 'enormora/packtory',
                CI_PROJECT_URL: 'https://gitlab.com/some/other'
            });

            assert.deepStrictEqual(environment, {
                githubServerAddress: 'https://github.com',
                githubRepository: 'enormora/packtory',
                gitlabProjectAddress: 'https://gitlab.com/some/other'
            });
        });

        test('readContinuousIntegrationEnvironment() returns undefined values when env vars are absent', function () {
            const environment: ContinuousIntegrationEnvironment = readContinuousIntegrationEnvironment({});

            assert.deepStrictEqual(environment, {
                githubServerAddress: undefined,
                githubRepository: undefined,
                gitlabProjectAddress: undefined
            });
        });
    });
});
