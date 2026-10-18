import assert from 'node:assert';
import { suite, test } from 'mocha';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

const probeTestTimeoutMilliseconds = 10_000;

suite('schema-contracts', function () {
    test('leaf config schemas keep their expected object keys and strict object behavior', async function () {
        const result = await runNodeProbe(
            `
            import { additionalFileDescriptionSchema } from './source/configuration/additional-files.ts';
            import { rootSchema } from './source/configuration/root.ts';
            import { mainPackageManifestSchema } from './source/configuration/main-package-manifest-schema.ts';
            import { registrySettingsSchema } from './source/configuration/registry-settings.ts';

            console.log(JSON.stringify({
                additionalFileShape: Object.keys(additionalFileDescriptionSchema._zod.def.innerType.def.shape),
                rootShape: Object.keys(rootSchema._zod.def.innerType.def.shape),
                registrySettingsShape: Object.keys(registrySettingsSchema._zod.def.innerType.def.shape),
                mainPackageManifestShape: Object.keys(mainPackageManifestSchema._zod.def.innerType.def.shape),
                additionalFileCatchallType: additionalFileDescriptionSchema._zod.def.innerType.def.catchall.type,
                rootCatchallType: rootSchema._zod.def.innerType.def.catchall.type,
                registrySettingsCatchallType: registrySettingsSchema._zod.def.innerType.def.catchall.type
            }));
        `,
            { timeoutMilliseconds: probeTestTimeoutMilliseconds }
        );

        assert.deepStrictEqual(result, {
            additionalFileShape: [ 'inputFilePath', 'targetFilePath' ],
            rootShape: [ 'javaScript', 'declarationFile' ],
            registrySettingsShape: [ 'registryAddress', 'authentication' ],
            mainPackageManifestShape: [ 'type', 'dependencies', 'devDependencies', 'peerDependencies', 'imports' ],
            additionalFileCatchallType: 'never',
            rootCatchallType: 'never',
            registrySettingsCatchallType: 'never'
        });
    });

    test('versioning schema keeps the automatic and manual branches', async function () {
        const result = await runNodeProbe(
            `
            import { safeParse } from './source/common/schema-validation.ts';
            import { versioningSettingsSchema } from './source/configuration/versioning-settings.ts';

            const unionDef = versioningSettingsSchema._zod.def.innerType.def;
            function optionKeys(option) {
                const optionDef = option.def.innerType.def;
                if (optionDef.type === 'union') {
                    return optionDef.options.map((nestedOption) => Object.keys(nestedOption.def.innerType.def.shape));
                }
                return Object.keys(optionDef.shape);
            }

            console.log(JSON.stringify({
                optionCount: unionDef.options.length,
                branchKeys: unionDef.options.map(optionKeys),
                automaticSuccess: safeParse(versioningSettingsSchema, {
                    automatic: true,
                    minimumVersion: '1.0.0'
                }).success,
                manualSuccess: safeParse(versioningSettingsSchema, { automatic: false, version: '1.0.0' }).success,
                providerSuccess: safeParse(versioningSettingsSchema, {
                    automatic: false,
                    provideVersion() {
                        return '1.0.0';
                    }
                }).success,
                sourceSuccess: safeParse(versioningSettingsSchema, {
                    automatic: false,
                    source: 'pull-request-labels'
                }).success,
                invalidAutomaticBranchSuccess: safeParse(versioningSettingsSchema, {
                    automatic: true,
                    version: '1.0.0'
                }).success,
                invalidManualBranchSuccess: safeParse(versioningSettingsSchema, {
                    automatic: false,
                    minimumVersion: '1.0.0'
                }).success
            }));
        `,
            { timeoutMilliseconds: probeTestTimeoutMilliseconds }
        );

        assert.deepStrictEqual(result, {
            optionCount: 2,
            branchKeys: [
                [ 'automatic', 'minimumVersion' ],
                [
                    [ 'automatic', 'version' ],
                    [ 'automatic', 'provideVersion' ],
                    [ 'automatic', 'source' ]
                ]
            ],
            automaticSuccess: true,
            manualSuccess: true,
            providerSuccess: true,
            sourceSuccess: true,
            invalidAutomaticBranchSuccess: false,
            invalidManualBranchSuccess: false
        });
    });

    test('package json schemas keep their runtime structure and forbidden key behavior', async function () {
        const result = await runNodeProbe(
            `
            import { safeParse } from './source/common/schema-validation.ts';
            import {
                additionalPackageManifestAttributesSchema
            } from './source/configuration/additional-package-manifest-attributes-schema.ts';
            import { mainPackageManifestSchema } from './source/configuration/main-package-manifest-schema.ts';

            const mainShape = mainPackageManifestSchema._zod.def.innerType.def.shape;
            const forbiddenKeySuccesses = [
                'bin',
                'dependencies',
                'peerDependencies',
                'devDependencies',
                'exports',
                'imports',
                'main',
                'name',
                'types',
                'type',
                'version'
            ].map((key) => safeParse(additionalPackageManifestAttributesSchema, { [key]: '1.0.0' }).success);

            console.log(JSON.stringify({
                mainShape: Object.keys(mainShape),
                typeLiteral: mainShape.type.def.values[0],
                dependencyRecordType: mainShape.dependencies.def.innerType.def.innerType.def.type,
                developmentDependencyRecordType: mainShape.devDependencies.def.innerType.def.innerType.def.type,
                peerDependencyRecordType: mainShape.peerDependencies.def.innerType.def.innerType.def.type,
                importsRecordType: mainShape.imports.def.innerType.def.innerType.def.type,
                validMainSuccess: safeParse(mainPackageManifestSchema, {
                    type: 'module',
                    dependencies: { dep: '1.0.0' }
                }).success,
                forbiddenKeySuccesses
            }));
        `,
            { timeoutMilliseconds: probeTestTimeoutMilliseconds }
        );

        assert.deepStrictEqual(result, {
            mainShape: [ 'type', 'dependencies', 'devDependencies', 'peerDependencies', 'imports' ],
            typeLiteral: 'module',
            dependencyRecordType: 'record',
            developmentDependencyRecordType: 'record',
            peerDependencyRecordType: 'record',
            importsRecordType: 'record',
            validMainSuccess: true,
            forbiddenKeySuccesses: [ false, false, false, false, false, false, false, false, false, false, false ]
        });
    });

    test('packtory config schemas keep their union and package tuple structure', async function () {
        const result = await runNodeProbe(
            `
            import { safeParse } from './source/common/schema-validation.ts';
            import { packtoryConfigurationSchema } from './source/configuration/packtory-configuration-schema.ts';
            import {
                packtoryConfigurationWithoutRegistrySchema
            } from './source/configuration/packtory-configuration-without-registry-schema.ts';

            function unwrapSchemaDef(schema) {
                let current = schema;
                while (current.def?.innerType !== undefined) {
                    current = current.def.innerType;
                }
                return current.def;
            }

            const withoutRegistryOptions = packtoryConfigurationWithoutRegistrySchema._zod.def.options;
            const firstOptionShape = withoutRegistryOptions[0].def.innerType.def.shape;
            const packageTuple = firstOptionShape.packages._zod.def.innerType.def;
            const packageShape = packageTuple.items[0].def.innerType.def.shape;
            const checksShape = unwrapSchemaDef(firstOptionShape.checks).shape;
            const commonShape = unwrapSchemaDef(firstOptionShape.commonPackageSettings).shape;

            console.log(JSON.stringify({
                optionCount: withoutRegistryOptions.length,
                topLevelKeys: withoutRegistryOptions.map((option) => Object.keys(option.def.innerType.def.shape)),
                packageTupleItemCounts: withoutRegistryOptions.map((option) =>
                    option.def.innerType.def.shape.packages._zod.def.innerType.def.items.length
                ),
                packageTupleHasRest: withoutRegistryOptions.map((option) =>
                    option.def.innerType.def.shape.packages._zod.def.innerType.def.rest !== undefined
                ),
                packageShapeKeys: Object.keys(packageShape),
                checksShapeKeys: Object.keys(checksShape),
                commonShapeKeys: Object.keys(commonShape),
                configurationIntersectionLeftKeys: Object.keys(
                    packtoryConfigurationSchema._zod.def.left.def.shape
                ),
                validWithoutRegistrySuccess: safeParse(packtoryConfigurationWithoutRegistrySchema, {
                    packages: [
                        {
                            name: 'package',
                            sourcesFolder: 'source',
                            mainPackageManifest: { type: 'module' },
                            roots: { main: { javaScript: 'index.js' } }
                        }
                    ]
                }).success
            }));
        `,
            { timeoutMilliseconds: probeTestTimeoutMilliseconds }
        );

        assert.deepStrictEqual(result, {
            optionCount: 4,
            topLevelKeys: [
                [ 'changelog', 'checks', 'commonPackageSettings', 'packages' ],
                [ 'changelog', 'checks', 'commonPackageSettings', 'packages' ],
                [ 'changelog', 'checks', 'commonPackageSettings', 'packages' ],
                [ 'changelog', 'checks', 'commonPackageSettings', 'packages' ]
            ],
            packageTupleItemCounts: [ 1, 1, 1, 1 ],
            packageTupleHasRest: [ true, true, true, true ],
            packageShapeKeys: [
                'sourcesFolder',
                'mainPackageManifest',
                'additionalChangelogSourceFiles',
                'additionalFiles',
                'includeSourceMapFiles',
                'additionalPackageManifestAttributes',
                'publishSettings',
                'dependencyPolicy',
                'deadCodeElimination',
                'name',
                'exportPackageManifest',
                'versioning',
                'bundleDependencies',
                'bundlePeerDependencies',
                'checks',
                'roots',
                'defaultModuleRoot',
                'packageInterface'
            ],
            checksShapeKeys: [
                'typeScriptIntegrity',
                'noDuplicatedFiles',
                'requiredFiles',
                'maximumBundleSize',
                'noUnusedBundleDependencies',
                'noDevelopmentDependencyImports',
                'uniqueTargetPaths',
                'noSideEffects',
                'noUnexposedExecutables',
                'nodeEngineCompatibility'
            ],
            commonShapeKeys: [
                'sourcesFolder',
                'mainPackageManifest',
                'additionalChangelogSourceFiles',
                'additionalFiles',
                'includeSourceMapFiles',
                'additionalPackageManifestAttributes',
                'publishSettings',
                'dependencyPolicy',
                'deadCodeElimination'
            ],
            configurationIntersectionLeftKeys: [ 'registrySettings' ],
            validWithoutRegistrySuccess: true
        });
    });

    test('schema source modules still validate representative valid and invalid inputs', async function () {
        const result = await runNodeProbe(
            `
            import { safeParse } from './source/common/schema-validation.ts';
            import { additionalFileDescriptionSchema } from './source/configuration/additional-files.ts';
            import { rootSchema } from './source/configuration/root.ts';
            import { packtoryConfigurationSchema } from './source/configuration/packtory-configuration-schema.ts';
            import { registrySettingsSchema } from './source/configuration/registry-settings.ts';

            console.log(JSON.stringify({
                validAdditionalFileSuccess: safeParse(additionalFileDescriptionSchema, {
                    inputFilePath: 'README.md',
                    targetFilePath: 'README.md'
                }).success,
                missingAdditionalFileSourceSuccess: safeParse(additionalFileDescriptionSchema, {
                    targetFilePath: 'README.md'
                }).success,
                validRootSuccess: safeParse(rootSchema, {
                    javaScript: 'index.js',
                    declarationFile: 'index.d.ts'
                }).success,
                missingRootJavaScriptSuccess: safeParse(rootSchema, {
                    declarationFile: 'index.d.ts'
                }).success,
                extraRootPropertySuccess: safeParse(rootSchema, {
                    javaScript: 'index.js',
                    extra: 'nope'
                }).success,
                validRegistrySuccess: safeParse(registrySettingsSchema, {
                    authentication: { type: 'bearer-token', token: 'secret' },
                    registryAddress: 'https://example.test'
                }).success,
                missingRegistryTokenSuccess: safeParse(registrySettingsSchema, {
                    registryAddress: 'https://example.test'
                }).success,
                validConfigurationSuccess: safeParse(packtoryConfigurationSchema, {
                    registrySettings: { authentication: { type: 'bearer-token', token: 'secret' } },
                    packages: [{
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    }]
                }).success,
                missingConfigurationRegistrySuccess: safeParse(packtoryConfigurationSchema, {
                    packages: [{
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    }]
                }).success,
                emptyConfigurationPackagesSuccess: safeParse(packtoryConfigurationSchema, {
                    registrySettings: { authentication: { type: 'bearer-token', token: 'secret' } },
                    packages: []
                }).success
            }));
        `,
            { timeoutMilliseconds: probeTestTimeoutMilliseconds }
        );

        assert.deepStrictEqual(result, {
            validAdditionalFileSuccess: true,
            missingAdditionalFileSourceSuccess: false,
            validRootSuccess: true,
            missingRootJavaScriptSuccess: false,
            extraRootPropertySuccess: false,
            validRegistrySuccess: true,
            missingRegistryTokenSuccess: true,
            validConfigurationSuccess: true,
            missingConfigurationRegistrySuccess: true,
            emptyConfigurationPackagesSuccess: false
        });
    });
});
