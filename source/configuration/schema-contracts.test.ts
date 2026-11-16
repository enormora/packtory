import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { additionalFileDescriptionSchema } from './additional-files.ts';
import { packtoryConfigurationSchema } from './packtory-configuration-schema.ts';
import { packtoryConfigurationWithoutRegistrySchema } from './packtory-configuration-without-registry-schema.ts';
import { registrySettingsSchema } from './registry-settings.ts';
import { rootSchema } from './root.ts';
import { versioningSettingsSchema } from './versioning-settings.ts';

suite('schema-contracts', function () {
    test('versioning schema keeps the automatic and manual branches', async function () {
        const result = {
            automaticSuccess: safeParse(versioningSettingsSchema, {
                automatic: true,
                minimumVersion: '1.0.0'
            })
                .success,
            manualSuccess: safeParse(versioningSettingsSchema, {
                automatic: false,
                version: '1.0.0'
            })
                .success,
            providerSuccess: safeParse(versioningSettingsSchema, {
                automatic: false,
                provideVersion() {
                    return '1.0.0';
                }
            })
                .success,
            sourceSuccess: safeParse(versioningSettingsSchema, {
                automatic: false,
                source: 'pull-request-labels'
            })
                .success,
            invalidAutomaticBranchSuccess: safeParse(versioningSettingsSchema, {
                automatic: true,
                version: '1.0.0'
            })
                .success,
            invalidManualBranchSuccess: safeParse(versioningSettingsSchema, {
                automatic: false,
                minimumVersion: '1.0.0'
            })
                .success
        };
        assert.deepStrictEqual(result, {
            automaticSuccess: true,
            manualSuccess: true,
            providerSuccess: true,
            sourceSuccess: true,
            invalidAutomaticBranchSuccess: false,
            invalidManualBranchSuccess: false
        });
    });

    test('packtory config schemas keep their union and package tuple structure', async function () {
        const result = {
            validWithoutRegistrySuccess: safeParse(packtoryConfigurationWithoutRegistrySchema, {
                packages: [ {
                    name: 'package',
                    sourcesFolder: 'source',
                    mainPackageManifest: {
                        type: 'module'
                    },
                    roots: {
                        main: {
                            javaScript: 'index.js'
                        }
                    }
                } ]
            })
                .success
        };
        assert.deepStrictEqual(result, {
            validWithoutRegistrySuccess: true
        });
    });

    test('schema source modules still validate representative valid and invalid inputs', async function () {
        const result = {
            validAdditionalFileSuccess: safeParse(additionalFileDescriptionSchema, {
                inputFilePath: 'README.md',
                targetFilePath: 'README.md'
            })
                .success,
            missingAdditionalFileSourceSuccess: safeParse(additionalFileDescriptionSchema, {
                targetFilePath: 'README.md'
            })
                .success,
            validRootSuccess: safeParse(rootSchema, {
                javaScript: 'index.js',
                declarationFile: 'index.d.ts'
            })
                .success,
            declarationOnlyRootSuccess: safeParse(rootSchema, {
                declarationFile: 'index.d.ts'
            })
                .success,
            extraRootPropertySuccess: safeParse(rootSchema, {
                javaScript: 'index.js',
                extra: 'nope'
            })
                .success,
            validRegistrySuccess: safeParse(registrySettingsSchema, {
                authentication: {
                    type: 'bearer-token',
                    token: 'secret'
                },
                registryAddress: 'https://example.test'
            })
                .success,
            missingRegistryTokenSuccess: safeParse(registrySettingsSchema, {
                registryAddress: 'https://example.test'
            })
                .success,
            validConfigurationSuccess: safeParse(packtoryConfigurationSchema, {
                registrySettings: {
                    authentication: {
                        type: 'bearer-token',
                        token: 'secret'
                    }
                },
                packages: [ {
                    sourcesFolder: 'source',
                    mainPackageManifest: {
                        type: 'module'
                    },
                    name: 'package',
                    roots: {
                        main: {
                            javaScript: 'index.js'
                        }
                    }
                } ]
            })
                .success,
            missingConfigurationRegistrySuccess: safeParse(packtoryConfigurationSchema, {
                packages: [ {
                    sourcesFolder: 'source',
                    mainPackageManifest: {
                        type: 'module'
                    },
                    name: 'package',
                    roots: {
                        main: {
                            javaScript: 'index.js'
                        }
                    }
                } ]
            })
                .success,
            emptyConfigurationPackagesSuccess: safeParse(packtoryConfigurationSchema, {
                registrySettings: {
                    authentication: {
                        type: 'bearer-token',
                        token: 'secret'
                    }
                },
                packages: []
            })
                .success
        };
        assert.deepStrictEqual(result, {
            validAdditionalFileSuccess: true,
            missingAdditionalFileSourceSuccess: false,
            validRootSuccess: true,
            declarationOnlyRootSuccess: true,
            extraRootPropertySuccess: false,
            validRegistrySuccess: true,
            missingRegistryTokenSuccess: true,
            validConfigurationSuccess: true,
            missingConfigurationRegistrySuccess: true,
            emptyConfigurationPackagesSuccess: false
        });
    });
});
