import { suite, test } from 'mocha';
import {
    configurationWith,
    configurationWithEmptyNoDuplicatedFilesAllowList,
    emptyNoDuplicatedFilesAllowListMessage,
    invalidConfiguration,
    mainPackageManifest,
    packageConfiguration,
    packageWithoutCommonSettings,
    validConfiguration
} from '../test-libraries/configuration-schema-test-support.ts';

suite('config common package settings', function () {
    suite('common settings accepted shapes', function () {
        const validationCases = [
            {
                name:
                    'validation succeeds when commonPackageSettings is given and a package contains no common settings',
                validate: validConfiguration(configurationWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageManifest
                    },
                    packages: [ packageWithoutCommonSettings() ]
                }))
            },
            {
                name:
                    'validation succeeds when commonPackageSettings is given and a package contains common settings as well',
                validate: validConfiguration(configurationWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageManifest
                    },
                    packages: [ packageConfiguration() ]
                }))
            },
            {
                name: 'validation succeeds when only sourcesFolder is provided in commonPackageSettings',
                validate: validConfiguration(configurationWith({
                    commonPackageSettings: { sourcesFolder: 'source' },
                    packages: [ packageConfiguration({ sourcesFolder: undefined }) ]
                }))
            },
            {
                name:
                    'validation succeeds when only sourcesFolder is provided in commonPackageSettings and in packages',
                validate: validConfiguration(configurationWith({
                    commonPackageSettings: { sourcesFolder: 'source' },
                    packages: [ packageConfiguration() ]
                }))
            },
            {
                name: 'validation succeeds when only mainPackageManifest is provided in commonPackageSettings',
                validate: validConfiguration(configurationWith({
                    commonPackageSettings: { mainPackageManifest },
                    packages: [ packageConfiguration({ mainPackageManifest: undefined }) ]
                }))
            },
            {
                name:
                    'validation succeeds when only mainPackageManifest is provided in commonPackageSettings and in packages',
                validate: validConfiguration(configurationWith({
                    commonPackageSettings: { mainPackageManifest },
                    packages: [ packageConfiguration() ]
                }))
            },
            {
                name: 'validation succeeds when all optional properties are given',
                validate: validConfiguration(configurationWith({
                    commonPackageSettings: {
                        sourcesFolder: 'source',
                        mainPackageManifest,
                        additionalFiles: [ { inputFilePath: 'foo', targetFilePath: 'foo' } ],
                        includeSourceMapFiles: true,
                        additionalPackageManifestAttributes: { license: 'foo' }
                    },
                    packages: [ packageConfiguration({
                        versioning: { automatic: true },
                        bundleDependencies: [ 'foo' ],
                        bundlePeerDependencies: [ 'foo' ],
                        additionalFiles: [ { inputFilePath: 'foo', targetFilePath: 'foo' } ],
                        includeSourceMapFiles: true,
                        additionalPackageManifestAttributes: { license: 'foo' }
                    }) ]
                }))
            },
            {
                name: 'validation fails when a non-object is given',
                validate: invalidConfiguration(true, [
                    'expected object, but got boolean',
                    'invalid value: expected object, but got boolean'
                ])
            }
        ];
        for (const { name, validate } of validationCases) {
            test(name, validate);
        }
    });

    suite('common settings validation failures', function () {
        const validationCases = [
            {
                name: 'validation fails when an empty object is given',
                validate: invalidConfiguration({}, [ 'invalid value doesn’t match expected union' ])
            },
            {
                name:
                    'validation fails when commonPackageSettings is not defined and mainPackageManifest is missing in a package',
                validate: invalidConfiguration(
                    configurationWith({ packages: [ packageConfiguration({ mainPackageManifest: undefined }) ] }),
                    [
                        'invalid value doesn’t match expected union'
                    ]
                )
            },
            {
                name: 'validation fails when checks.noDuplicatedFiles misses the enabled flag',
                validate: invalidConfiguration(
                    configurationWith({
                        checks: { noDuplicatedFiles: {} },
                        packages: [ packageConfiguration() ]
                    }),
                    [ 'invalid value doesn’t match expected union' ]
                )
            },
            {
                name:
                    'validation fails when a per-package noDuplicatedFiles.allowList contains an empty path (registry config)',
                validate: invalidConfiguration(configurationWithEmptyNoDuplicatedFilesAllowList(), [
                    emptyNoDuplicatedFilesAllowListMessage
                ])
            },
            {
                name:
                    'validation fails when commonPackageSettings is empty and packages don’t define required properties',
                validate: invalidConfiguration(
                    configurationWith({ commonPackageSettings: {}, packages: [ packageWithoutCommonSettings() ] }),
                    [
                        'invalid value doesn’t match expected union'
                    ]
                )
            },
            {
                name: 'validation fails when commonPackageSettings contains only mainPackageManifest',
                validate: invalidConfiguration(
                    configurationWith({
                        commonPackageSettings: { mainPackageManifest },
                        packages: [ packageWithoutCommonSettings() ]
                    }),
                    [ 'invalid value doesn’t match expected union' ]
                )
            },
            {
                name:
                    'validation fails when commonPackageSettings is undefined and sourcesFolder is missing in a package',
                validate: invalidConfiguration(
                    configurationWith({
                        commonPackageSettings: undefined,
                        packages: [ packageConfiguration({ sourcesFolder: undefined }) ]
                    }),
                    [ 'invalid value doesn’t match expected union' ]
                )
            },
            {
                name: 'validation fails when commonPackageSettings contains only sourcesFolder',
                validate: invalidConfiguration(
                    configurationWith({
                        commonPackageSettings: { sourcesFolder: 'foo' },
                        packages: [ packageWithoutCommonSettings() ]
                    }),
                    [ 'invalid value doesn’t match expected union' ]
                )
            }
        ];
        for (const { name, validate } of validationCases) {
            test(name, validate);
        }
    });
});
