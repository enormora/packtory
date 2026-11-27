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
        const acceptCommonSettingsOnly = validConfiguration(configurationWith({
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageManifest
            },
            packages: [ packageWithoutCommonSettings() ]
        }));
        test(
            'validation succeeds when commonPackageSettings is given and a package contains no common settings',
            acceptCommonSettingsOnly
        );

        const acceptCommonAndPackageSettings = validConfiguration(configurationWith({
            commonPackageSettings: {
                sourcesFolder: 'source',
                mainPackageManifest
            },
            packages: [ packageConfiguration() ]
        }));
        test(
            'validation succeeds when commonPackageSettings is given and a package contains common settings as well',
            acceptCommonAndPackageSettings
        );

        const acceptCommonSourcesFolder = validConfiguration(configurationWith({
            commonPackageSettings: { sourcesFolder: 'source' },
            packages: [ packageConfiguration({ sourcesFolder: undefined }) ]
        }));
        test(
            'validation succeeds when only sourcesFolder is provided in commonPackageSettings',
            acceptCommonSourcesFolder
        );

        const acceptCommonAndPackageSourcesFolder = validConfiguration(configurationWith({
            commonPackageSettings: { sourcesFolder: 'source' },
            packages: [ packageConfiguration() ]
        }));
        test(
            'validation succeeds when only sourcesFolder is provided in commonPackageSettings and in packages',
            acceptCommonAndPackageSourcesFolder
        );

        const acceptCommonManifest = validConfiguration(configurationWith({
            commonPackageSettings: { mainPackageManifest },
            packages: [ packageConfiguration({ mainPackageManifest: undefined }) ]
        }));
        test(
            'validation succeeds when only mainPackageManifest is provided in commonPackageSettings',
            acceptCommonManifest
        );

        const acceptCommonAndPackageManifest = validConfiguration(configurationWith({
            commonPackageSettings: { mainPackageManifest },
            packages: [ packageConfiguration() ]
        }));
        test(
            'validation succeeds when only mainPackageManifest is provided in commonPackageSettings and in packages',
            acceptCommonAndPackageManifest
        );

        const acceptAllCommonSettings = validConfiguration(configurationWith({
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
        }));
        test(
            'validation succeeds when all optional properties are given',
            acceptAllCommonSettings
        );

        test(
            'validation fails when a non-object is given',
            invalidConfiguration(true, [
                'expected object, but got boolean',
                'invalid value: expected object, but got boolean'
            ])
        );
    });

    suite('common settings validation failures', function () {
        test(
            'validation fails when an empty object is given',
            invalidConfiguration({}, [ 'invalid value doesn’t match expected union' ])
        );

        const rejectMissingPackageManifest = invalidConfiguration(
            configurationWith({ packages: [ packageConfiguration({ mainPackageManifest: undefined }) ] }),
            [
                'invalid value doesn’t match expected union'
            ]
        );
        test(
            'validation fails when commonPackageSettings is not defined and mainPackageManifest is missing in a package',
            rejectMissingPackageManifest
        );

        const rejectMissingDuplicationEnabled = invalidConfiguration(
            configurationWith({
                checks: { noDuplicatedFiles: {} },
                packages: [ packageConfiguration() ]
            }),
            [ 'invalid value doesn’t match expected union' ]
        );
        test(
            'validation fails when checks.noDuplicatedFiles misses the enabled flag',
            rejectMissingDuplicationEnabled
        );

        test(
            'validation fails when a per-package noDuplicatedFiles.allowList contains an empty path (registry config)',
            invalidConfiguration(configurationWithEmptyNoDuplicatedFilesAllowList(), [
                emptyNoDuplicatedFilesAllowListMessage
            ])
        );

        const rejectEmptyCommonSettings = invalidConfiguration(
            configurationWith({ commonPackageSettings: {}, packages: [ packageWithoutCommonSettings() ] }),
            [
                'invalid value doesn’t match expected union'
            ]
        );
        test(
            'validation fails when commonPackageSettings is empty and packages don’t define required properties',
            rejectEmptyCommonSettings
        );

        const rejectCommonManifestWithoutSources = invalidConfiguration(
            configurationWith({
                commonPackageSettings: { mainPackageManifest },
                packages: [ packageWithoutCommonSettings() ]
            }),
            [ 'invalid value doesn’t match expected union' ]
        );
        test(
            'validation fails when commonPackageSettings contains only mainPackageManifest',
            rejectCommonManifestWithoutSources
        );

        const rejectCommonSettingsWithoutSources = invalidConfiguration(
            configurationWith({
                commonPackageSettings: undefined,
                packages: [ packageConfiguration({ sourcesFolder: undefined }) ]
            }),
            [ 'invalid value doesn’t match expected union' ]
        );
        test(
            'validation fails when commonPackageSettings is undefined and sourcesFolder is missing in a package',
            rejectCommonSettingsWithoutSources
        );

        const rejectCommonSourcesWithoutManifest = invalidConfiguration(
            configurationWith({
                commonPackageSettings: { sourcesFolder: 'foo' },
                packages: [ packageWithoutCommonSettings() ]
            }),
            [ 'invalid value doesn’t match expected union' ]
        );
        test(
            'validation fails when commonPackageSettings contains only sourcesFolder',
            rejectCommonSourcesWithoutManifest
        );
    });
});
