import assert from 'node:assert';
import { test } from 'mocha';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

test('leaf config schemas keep their expected object keys and strict object behavior', async () => {
    const result = await runNodeProbe(`
        import { additionalFileDescriptionSchema } from './source/config/additional-files.ts';
        import { entryPointSchema } from './source/config/entry-point.ts';
        import { mainPackageJsonSchema } from './source/config/main-package-json-schema.ts';
        import { registrySettingsSchema } from './source/config/registry-settings.ts';

        console.log(JSON.stringify({
            additionalFileShape: Object.keys(additionalFileDescriptionSchema._zod.def.innerType.def.shape),
            entryPointShape: Object.keys(entryPointSchema._zod.def.innerType.def.shape),
            registrySettingsShape: Object.keys(registrySettingsSchema._zod.def.innerType.def.shape),
            mainPackageJsonShape: Object.keys(mainPackageJsonSchema._zod.def.innerType.def.shape),
            additionalFileCatchallType: additionalFileDescriptionSchema._zod.def.innerType.def.catchall.type,
            entryPointCatchallType: entryPointSchema._zod.def.innerType.def.catchall.type,
            registrySettingsCatchallType: registrySettingsSchema._zod.def.innerType.def.catchall.type
        }));
    `);

    assert.deepStrictEqual(result, {
        additionalFileShape: ['sourceFilePath', 'targetFilePath'],
        entryPointShape: ['js', 'declarationFile'],
        registrySettingsShape: ['registryUrl', 'auth'],
        mainPackageJsonShape: ['type', 'dependencies', 'devDependencies', 'peerDependencies'],
        additionalFileCatchallType: 'never',
        entryPointCatchallType: 'never',
        registrySettingsCatchallType: 'never'
    });
});

test('versioning schema keeps the discriminant and both branches', async () => {
    const result = await runNodeProbe(`
        import { safeParse } from '@schema-hub/zod-error-formatter';
        import { versioningSettingsSchema } from './source/config/versioning-settings.ts';

        const unionDef = versioningSettingsSchema._zod.def.innerType.def;

        console.log(JSON.stringify({
            discriminator: unionDef.discriminator,
            optionCount: unionDef.options.length,
            branchKeys: unionDef.options.map((option) => Object.keys(option.def.innerType.def.shape)),
            branchLiterals: unionDef.options.map((option) => option.def.innerType.def.shape.automatic.def.values[0]),
            automaticSuccess: safeParse(versioningSettingsSchema, {
                automatic: true,
                minimumVersion: '1.0.0'
            }).success,
            manualSuccess: safeParse(versioningSettingsSchema, { automatic: false, version: '1.0.0' }).success,
            invalidAutomaticBranchSuccess: safeParse(versioningSettingsSchema, {
                automatic: true,
                version: '1.0.0'
            }).success,
            invalidManualBranchSuccess: safeParse(versioningSettingsSchema, {
                automatic: false,
                minimumVersion: '1.0.0'
            }).success
        }));
    `);

    assert.deepStrictEqual(result, {
        discriminator: 'automatic',
        optionCount: 2,
        branchKeys: [
            ['automatic', 'minimumVersion'],
            ['automatic', 'version']
        ],
        branchLiterals: [true, false],
        automaticSuccess: true,
        manualSuccess: true,
        invalidAutomaticBranchSuccess: false,
        invalidManualBranchSuccess: false
    });
});

test('package json schemas keep their runtime structure and forbidden key behavior', async () => {
    const result = await runNodeProbe(`
        import { safeParse } from '@schema-hub/zod-error-formatter';
        import {
            additionalPackageJsonAttributesSchema
        } from './source/config/additional-package-json-attributes-schema.ts';
        import { mainPackageJsonSchema } from './source/config/main-package-json-schema.ts';

        const mainShape = mainPackageJsonSchema._zod.def.innerType.def.shape;
        const forbiddenKeySuccesses = [
            'dependencies',
            'peerDependencies',
            'devDependencies',
            'main',
            'name',
            'types',
            'type',
            'version'
        ].map((key) => safeParse(additionalPackageJsonAttributesSchema, { [key]: '1.0.0' }).success);

        console.log(JSON.stringify({
            mainShape: Object.keys(mainShape),
            typeLiteral: mainShape.type.def.values[0],
            dependencyRecordType: mainShape.dependencies.def.innerType.def.innerType.def.type,
            devDependencyRecordType: mainShape.devDependencies.def.innerType.def.innerType.def.type,
            peerDependencyRecordType: mainShape.peerDependencies.def.innerType.def.innerType.def.type,
            validMainSuccess: safeParse(mainPackageJsonSchema, {
                type: 'module',
                dependencies: { dep: '1.0.0' }
            }).success,
            forbiddenKeySuccesses
        }));
    `);

    assert.deepStrictEqual(result, {
        mainShape: ['type', 'dependencies', 'devDependencies', 'peerDependencies'],
        typeLiteral: 'module',
        dependencyRecordType: 'record',
        devDependencyRecordType: 'record',
        peerDependencyRecordType: 'record',
        validMainSuccess: true,
        forbiddenKeySuccesses: [false, false, false, false, false, false, false, false]
    });
});

test('packtory config schemas keep their union and package tuple structure', async () => {
    const result = await runNodeProbe(`
        import { safeParse } from '@schema-hub/zod-error-formatter';
        import { packtoryConfigSchema } from './source/config/packtory-config-schema.ts';
        import {
            packtoryConfigWithoutRegistrySchema
        } from './source/config/packtory-config-without-registry-schema.ts';

        const withoutRegistryOptions = packtoryConfigWithoutRegistrySchema._zod.def.options;
        const firstOptionShape = withoutRegistryOptions[0].def.innerType.def.shape;
        const packageTuple = firstOptionShape.packages._zod.def.innerType.def;
        const packageShape = packageTuple.items[0].def.innerType.def.shape;
        const checksShape = firstOptionShape.checks.def.innerType.def.shape;
        const commonShape = firstOptionShape.commonPackageSettings.def.innerType.def.shape;

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
            configIntersectionLeftKeys: Object.keys(
                packtoryConfigSchema._zod.def.left.def.shape
            ),
            validWithoutRegistrySuccess: safeParse(packtoryConfigWithoutRegistrySchema, {
                packages: [
                    {
                        name: 'pkg',
                        sourcesFolder: 'src',
                        mainPackageJson: { type: 'module' },
                        entryPoints: [{ js: 'index.js' }]
                    }
                ]
            }).success
        }));
    `);

    assert.deepStrictEqual(result, {
        optionCount: 4,
        topLevelKeys: [
            ['checks', 'commonPackageSettings', 'packages'],
            ['checks', 'commonPackageSettings', 'packages'],
            ['checks', 'commonPackageSettings', 'packages'],
            ['checks', 'commonPackageSettings', 'packages']
        ],
        packageTupleItemCounts: [1, 1, 1, 1],
        packageTupleHasRest: [true, true, true, true],
        packageShapeKeys: [
            'sourcesFolder',
            'mainPackageJson',
            'additionalFiles',
            'includeSourceMapFiles',
            'additionalPackageJsonAttributes',
            'publishSettings',
            'dependencyPolicy',
            'name',
            'entryPoints',
            'versioning',
            'bundleDependencies',
            'bundlePeerDependencies',
            'checks'
        ],
        checksShapeKeys: [
            'noDuplicatedFiles',
            'requiredFiles',
            'maxBundleSize',
            'noUnusedBundleDependencies',
            'noDevDependencyImports',
            'uniqueTargetPaths'
        ],
        commonShapeKeys: [
            'sourcesFolder',
            'mainPackageJson',
            'additionalFiles',
            'includeSourceMapFiles',
            'additionalPackageJsonAttributes',
            'publishSettings',
            'dependencyPolicy'
        ],
        configIntersectionLeftKeys: ['registrySettings'],
        validWithoutRegistrySuccess: true
    });
});

test('schema source modules still validate representative valid and invalid inputs', async () => {
    const result = await runNodeProbe(`
        import { safeParse } from '@schema-hub/zod-error-formatter';
        import { additionalFileDescriptionSchema } from './source/config/additional-files.ts';
        import { entryPointSchema } from './source/config/entry-point.ts';
        import { packtoryConfigSchema } from './source/config/packtory-config-schema.ts';
        import { registrySettingsSchema } from './source/config/registry-settings.ts';

        console.log(JSON.stringify({
            validAdditionalFileSuccess: safeParse(additionalFileDescriptionSchema, {
                sourceFilePath: 'README.md',
                targetFilePath: 'README.md'
            }).success,
            missingAdditionalFileSourceSuccess: safeParse(additionalFileDescriptionSchema, {
                targetFilePath: 'README.md'
            }).success,
            validEntryPointSuccess: safeParse(entryPointSchema, {
                js: 'index.js',
                declarationFile: 'index.d.ts'
            }).success,
            missingEntryPointJsSuccess: safeParse(entryPointSchema, {
                declarationFile: 'index.d.ts'
            }).success,
            extraEntryPointPropertySuccess: safeParse(entryPointSchema, {
                js: 'index.js',
                extra: 'nope'
            }).success,
            validRegistrySuccess: safeParse(registrySettingsSchema, {
                auth: { type: 'bearer-token', token: 'secret' },
                registryUrl: 'https://example.test'
            }).success,
            missingRegistryTokenSuccess: safeParse(registrySettingsSchema, {
                registryUrl: 'https://example.test'
            }).success,
            validConfigSuccess: safeParse(packtoryConfigSchema, {
                registrySettings: { auth: { type: 'bearer-token', token: 'secret' } },
                packages: [{
                    sourcesFolder: 'src',
                    mainPackageJson: { type: 'module' },
                    name: 'pkg',
                    entryPoints: [{ js: 'index.js' }]
                }]
            }).success,
            missingConfigRegistrySuccess: safeParse(packtoryConfigSchema, {
                packages: [{
                    sourcesFolder: 'src',
                    mainPackageJson: { type: 'module' },
                    name: 'pkg',
                    entryPoints: [{ js: 'index.js' }]
                }]
            }).success,
            emptyConfigPackagesSuccess: safeParse(packtoryConfigSchema, {
                registrySettings: { auth: { type: 'bearer-token', token: 'secret' } },
                packages: []
            }).success
        }));
    `);

    assert.deepStrictEqual(result, {
        validAdditionalFileSuccess: true,
        missingAdditionalFileSourceSuccess: false,
        validEntryPointSuccess: true,
        missingEntryPointJsSuccess: false,
        extraEntryPointPropertySuccess: false,
        validRegistrySuccess: true,
        missingRegistryTokenSuccess: false,
        validConfigSuccess: true,
        missingConfigRegistrySuccess: false,
        emptyConfigPackagesSuccess: false
    });
});
