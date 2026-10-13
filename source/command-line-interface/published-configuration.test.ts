import assert from 'node:assert';
import { suite, test } from 'mocha';
import { normalizePublishedConfiguration } from './published-configuration.ts';

suite('published configuration adapter', function () {
    test('translates published fields and strategy values without rewriting npm manifests or ordinary strings', function () {
        const manifest = { name: 'auto', config: { auth: 'env' }, dependencies: { sbom: '1.0.0' } };
        const published = {
            registrySettings: {
                registryUrl: 'https://registry.test',
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env', idTokenEnvVar: 'TOKEN' },
                    metadata: 'inherit-publish-auth'
                }
            },
            commonPackageSettings: {
                mainPackageJson: manifest,
                additionalPackageJsonAttributes: manifest,
                publishSettings: { sbom: { enabled: true }, provenance: { type: 'auto' } },
                checks: { maxBundleSize: { bytes: 42 }, noDevDependencyImports: { enabled: true } }
            },
            packages: [ {
                name: 'env',
                exportPackageJson: true,
                roots: { main: { js: 'auto' } },
                packageInterface: { bins: [ { name: 'auto', root: 'main' } ] }
            } ],
            changelog: { prLog: {}, explicitBaseRef: 'main' },
            releasePullRequest: { githubActionsCi: { workflow: 'ci.yml' } },
            untouched: { constructor: 'auto', type: 'custom', provider: 'github-actions', metadata: 'anonymous' }
        };
        assert.deepStrictEqual(normalizePublishedConfiguration(published), {
            registrySettings: {
                registryAddress: 'https://registry.test',
                authentication: {
                    publish: {
                        type: 'npm-open-identity-connect',
                        provider: 'environment',
                        identityTokenEnvironmentVariable: 'TOKEN'
                    },
                    metadata: 'inherit-publish-authentication'
                }
            },
            commonPackageSettings: {
                mainPackageManifest: manifest,
                additionalPackageManifestAttributes: manifest,
                publishSettings: { softwareBillOfMaterials: { enabled: true }, provenance: { type: 'automatic' } },
                checks: { maximumBundleSize: { bytes: 42 }, noDevelopmentDependencyImports: { enabled: true } }
            },
            packages: [ {
                name: 'env',
                exportPackageManifest: true,
                roots: { main: { javaScript: 'auto' } },
                packageInterface: { executables: [ { name: 'auto', root: 'main' } ] }
            } ],
            changelog: { pullRequestLog: {}, explicitBaseReference: 'main' },
            releasePullRequest: { githubActionsContinuousIntegration: { workflow: 'ci.yml' } },
            untouched: { constructor: 'auto', type: 'custom', provider: 'github-actions', metadata: 'anonymous' }
        });
        assert.strictEqual(published.packages[0]?.roots.main.js, 'auto');
    });

    test('preserves automatic strategy modes and scalar values', function () {
        assert.deepStrictEqual(
            normalizePublishedConfiguration({ publish: { type: 'npm-oidc', provider: 'auto' }, metadata: 'auto' }),
            { publish: { type: 'npm-open-identity-connect', provider: 'automatic' }, metadata: 'automatic' }
        );
        for (const value of [ null, undefined, false, 42, 'auto' ]) {
            assert.strictEqual(normalizePublishedConfiguration(value), value);
        }
    });

    test('preserves root and package names in dictionaries while translating their settings', function () {
        assert.deepStrictEqual(
            normalizePublishedConfiguration({ roots: { js: { js: 'entry.js' } }, paths: { sbom: 'CHANGELOG.md' } }),
            { roots: { js: { javaScript: 'entry.js' } }, paths: { sbom: 'CHANGELOG.md' } }
        );
        assert.deepStrictEqual(normalizePublishedConfiguration({ roots: null, paths: [] }), { roots: null, paths: [] });
    });
});
