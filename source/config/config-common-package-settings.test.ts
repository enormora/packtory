import { suite, test } from 'mocha';
import {
    configWith,
    configWithEmptyNoDuplicatedFilesAllowList,
    emptyNoDuplicatedFilesAllowListMessage,
    invalidConfig,
    mainPackageJson,
    packageConfig,
    packageWithoutCommonSettings,
    validConfig
} from './config-schema-test-support.ts';

suite('config common package settings', function () {
    suite('common settings accepted shapes', function () {
        test(
            'validation succeeds when commonPackageSettings is given and a package contains no common settings',
            validConfig(configWith({
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson
                },
                packages: [ packageWithoutCommonSettings() ]
            }))
        );

        test(
            'validation succeeds when commonPackageSettings is given and a package contains common settings as well',
            validConfig(configWith({
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson
                },
                packages: [ packageConfig() ]
            }))
        );

        test(
            'validation succeeds when only sourcesFolder is provided in commonPackageSettings',
            validConfig(configWith({
                commonPackageSettings: { sourcesFolder: 'source' },
                packages: [ packageConfig({ sourcesFolder: undefined }) ]
            }))
        );

        test(
            'validation succeeds when only sourcesFolder is provided in commonPackageSettings and in packages',
            validConfig(configWith({
                commonPackageSettings: { sourcesFolder: 'source' },
                packages: [ packageConfig() ]
            }))
        );

        test(
            'validation succeeds when only mainPackageJson is provided in commonPackageSettings',
            validConfig(configWith({
                commonPackageSettings: { mainPackageJson },
                packages: [ packageConfig({ mainPackageJson: undefined }) ]
            }))
        );

        test(
            'validation succeeds when only mainPackageJson is provided in commonPackageSettings and in packages',
            validConfig(configWith({
                commonPackageSettings: { mainPackageJson },
                packages: [ packageConfig() ]
            }))
        );

        test(
            'validation succeeds when all optional properties are given',
            validConfig(configWith({
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson,
                    additionalFiles: [ { sourceFilePath: 'foo', targetFilePath: 'foo' } ],
                    includeSourceMapFiles: true,
                    additionalPackageJsonAttributes: { license: 'foo' }
                },
                packages: [ packageConfig({
                    versioning: { automatic: true },
                    bundleDependencies: [ 'foo' ],
                    bundlePeerDependencies: [ 'foo' ],
                    additionalFiles: [ { sourceFilePath: 'foo', targetFilePath: 'foo' } ],
                    includeSourceMapFiles: true,
                    additionalPackageJsonAttributes: { license: 'foo' }
                }) ]
            }))
        );

        test(
            'validation fails when a non-object is given',
            invalidConfig(true, [
                'expected object, but got boolean',
                'invalid value: expected object, but got boolean'
            ])
        );
    });

    suite('common settings validation failures', function () {
        test(
            'validation fails when an empty object is given',
            invalidConfig({}, [ 'invalid value doesn’t match expected union' ])
        );

        test(
            'validation fails when commonPackageSettings is not defined and mainPackageJson is missing in a package',
            invalidConfig(configWith({ packages: [ packageConfig({ mainPackageJson: undefined }) ] }), [
                'invalid value doesn’t match expected union'
            ])
        );

        test(
            'validation fails when checks.noDuplicatedFiles misses the enabled flag',
            invalidConfig(
                configWith({
                    checks: { noDuplicatedFiles: {} },
                    packages: [ packageConfig() ]
                }),
                [ 'invalid value doesn’t match expected union' ]
            )
        );

        test(
            'validation fails when a per-package noDuplicatedFiles.allowList contains an empty path (registry config)',
            invalidConfig(configWithEmptyNoDuplicatedFilesAllowList(), [ emptyNoDuplicatedFilesAllowListMessage ])
        );

        test(
            'validation fails when commonPackageSettings is empty and packages don’t define required properties',
            invalidConfig(configWith({ commonPackageSettings: {}, packages: [ packageWithoutCommonSettings() ] }), [
                'invalid value doesn’t match expected union'
            ])
        );

        test(
            'validation fails when commonPackageSettings contains only mainPackageJson',
            invalidConfig(
                configWith({
                    commonPackageSettings: { mainPackageJson },
                    packages: [ packageWithoutCommonSettings() ]
                }),
                [ 'invalid value doesn’t match expected union' ]
            )
        );

        test(
            'validation fails when commonPackageSettings is undefined and sourcesFolder is missing in a package',
            invalidConfig(
                configWith({
                    commonPackageSettings: undefined,
                    packages: [ packageConfig({ sourcesFolder: undefined }) ]
                }),
                [ 'invalid value doesn’t match expected union' ]
            )
        );

        test(
            'validation fails when commonPackageSettings contains only sourcesFolder',
            invalidConfig(
                configWith({
                    commonPackageSettings: { sourcesFolder: 'foo' },
                    packages: [ packageWithoutCommonSettings() ]
                }),
                [ 'invalid value doesn’t match expected union' ]
            )
        );
    });
});
