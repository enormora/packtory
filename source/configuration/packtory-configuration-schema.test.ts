import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigurationSchema } from './packtory-configuration-schema.ts';

const validConfiguration = {
    registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
    packages: [
        {
            sourcesFolder: 'source',
            mainPackageManifest: { type: 'module' },
            name: 'foo',
            roots: { main: { javaScript: 'foo' } },
            publishSettings: { access: 'public' }
        }
    ]
};

suite('packtory-config-schema', function () {
    test('packtory config schema accepts a valid config', function () {
        assert.strictEqual(safeParse(packtoryConfigurationSchema, validConfiguration).success, true);
    });

    test('packtory config schema accepts configs without registrySettings', function () {
        assert.strictEqual(
            safeParse(packtoryConfigurationSchema, {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        name: 'foo',
                        roots: { main: { javaScript: 'foo' } },
                        publishSettings: { access: 'public' }
                    }
                ]
            })
                .success,
            true
        );
    });

    test(
        'packtory config schema: validation succeeds for a minimal valid config',
        checkValidationSuccess({
            schema: packtoryConfigurationSchema,
            data: validConfiguration,
            expectedData: validConfiguration
        })
    );

    test(
        'packtory config schema: validation succeeds when registrySettings is omitted',
        checkValidationSuccess({
            schema: packtoryConfigurationSchema,
            data: {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        name: 'foo',
                        roots: { main: { javaScript: 'foo' } },
                        publishSettings: { access: 'public' }
                    }
                ]
            }
        })
    );

    test(
        'packtory config schema: validation succeeds when registrySettings is provided without auth',
        checkValidationSuccess({
            schema: packtoryConfigurationSchema,
            data: {
                registrySettings: { registryAddress: 'https://registry.example' },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        name: 'foo',
                        roots: { main: { javaScript: 'foo' } },
                        publishSettings: { access: 'public' }
                    }
                ]
            }
        })
    );

    test(
        'packtory config schema: accepts a config with publishSettings declared in commonPackageSettings only',
        checkValidationSuccess({
            schema: packtoryConfigurationSchema,
            data: {
                registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageManifest: { type: 'module' },
                    publishSettings: { access: 'public', provenance: { type: 'automatic' } }
                },
                packages: [ { name: 'foo', roots: { main: { javaScript: 'foo' } } } ]
            }
        })
    );

    test(
        'packtory config schema: accepts a config with mixed common default and per-package override',
        checkValidationSuccess({
            schema: packtoryConfigurationSchema,
            data: {
                registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageManifest: { type: 'module' },
                    publishSettings: { access: 'public' }
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { javaScript: 'foo' } }
                    },
                    {
                        name: 'bar',
                        roots: { main: { javaScript: 'bar' } },
                        publishSettings: { access: 'restricted' }
                    }
                ]
            }
        })
    );

    test(
        'packtory config schema: accepts changelog outputs',
        checkValidationSuccess({
            schema: packtoryConfigurationSchema,
            data: {
                registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                changelog: {
                    pullRequestLog: {
                        validLabels: { operations: 'Operations' },
                        ignoredLabels: [ 'skip-changelog' ],
                        versionBumps: { patch: [ 'operations' ] },
                        dateFormat: 'yyyy-MM-dd',
                        collapseRules: [
                            {
                                label: 'operations',
                                pattern: '^Update (?<dependency>.+?) from (?<from>.+?) to (?<to>.+?)$',
                                replace: 'Update $<dependency> from $<from> to $<to>'
                            },
                            {
                                label: 'operations',
                                pattern: '^Update (?<dependency>.+?) to (?<version>.+?)$',
                                replace: 'Update $<dependency> to $<version>',
                                versionGroup: 'version'
                            },
                            {
                                label: 'operations',
                                pattern: '^Update (?<dependency>.+?)$',
                                replace: 'Update $<dependency>',
                                collapse: 'same'
                            }
                        ],
                        labelLookupIntervalMilliseconds: 500,
                        maximumRateLimitRetryCount: 5
                    },
                    targetScopedLabelPattern: 'scope:{targetName}:{label}',
                    packageTagFormat: 'pkg/{packageName}/v{version}',
                    explicitBaseReference: 'main',
                    outputs: [
                        { kind: 'repository-file', path: 'CHANGELOG.md' },
                        { kind: 'package-file', path: 'CHANGELOG.md' },
                        { kind: 'package-file', paths: { foo: 'packages/foo/CHANGELOG.md' } },
                        { kind: 'github-release' }
                    ]
                },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        name: 'foo',
                        roots: { main: { javaScript: 'foo' } },
                        publishSettings: { access: 'public' }
                    }
                ]
            }
        })
    );
});
