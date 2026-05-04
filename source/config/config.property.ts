import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import fc from 'fast-check';
import { test } from 'mocha';
import { configToResolveAndLinkOptions } from '../packtory/map-config.ts';
import type { PacktoryConfig } from './config.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';
import type { AdditionalPackageJsonAttributes } from './package-json.ts';

const packageNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const fileNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const dependencyNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const additionalAttributeKeyArbitrary = fileNameArbitrary.filter((key) => {
    return ![
        'dependencies',
        'peerDependencies',
        'devDependencies',
        'main',
        'name',
        'types',
        'type',
        'version'
    ].includes(key);
});

function createEntryPoint(
    jsBaseName: string,
    declarationBaseName: string | undefined
): { js: string; declarationFile?: string | undefined } {
    return declarationBaseName === undefined
        ? { js: `${jsBaseName}.js` }
        : { js: `${jsBaseName}.js`, declarationFile: `${declarationBaseName}.d.ts` };
}

const validConfigArbitrary = fc
    .record({
        packageName: packageNameArbitrary,
        commonSourcesFolder: fc.option(fc.stringMatching(/^[a-z][\d/a-z-]{0,12}$/), { nil: undefined }),
        packageSourcesFolder: fc.option(fc.stringMatching(/^[a-z][\d/a-z-]{0,12}$/), { nil: undefined }),
        packageMainType: fc.option(fc.constant<'module'>('module'), { nil: undefined }),
        commonMainType: fc.option(fc.constant<'module'>('module'), { nil: undefined }),
        commonIncludeSourceMaps: fc.option(fc.boolean(), { nil: undefined }),
        packageIncludeSourceMaps: fc.option(fc.boolean(), { nil: undefined }),
        commonAdditionalAttributes: fc.dictionary(additionalAttributeKeyArbitrary, fc.jsonValue(), { maxKeys: 2 }),
        packageAdditionalAttributes: fc.dictionary(additionalAttributeKeyArbitrary, fc.jsonValue(), { maxKeys: 2 }),
        commonAdditionalFileName: fc.option(fileNameArbitrary, { nil: undefined }),
        packageAdditionalFileName: fc.option(fileNameArbitrary, { nil: undefined }),
        entryBaseName: fileNameArbitrary,
        declarationBaseName: fc.option(fileNameArbitrary, { nil: undefined }),
        dependencyNames: fc.uniqueArray(dependencyNameArbitrary, { maxLength: 2 })
    })
    .filter((config) => {
        return (
            (config.commonSourcesFolder !== undefined || config.packageSourcesFolder !== undefined) &&
            config.dependencyNames.every((dependencyName) => {
                return dependencyName !== config.packageName;
            })
        );
    })
    .map((config) => {
        const commonPackageSettings = {
            ...(config.commonSourcesFolder === undefined ? {} : { sourcesFolder: config.commonSourcesFolder }),
            mainPackageJson: config.commonMainType === undefined ? {} : { type: config.commonMainType },
            ...(config.commonIncludeSourceMaps === undefined
                ? {}
                : { includeSourceMapFiles: config.commonIncludeSourceMaps }),
            ...(config.commonAdditionalFileName === undefined
                ? {}
                : {
                      additionalFiles: [
                          {
                              sourceFilePath: `${config.commonAdditionalFileName}.txt`,
                              targetFilePath: `${config.commonAdditionalFileName}.txt`
                          }
                      ]
                  }),
            ...(Object.keys(config.commonAdditionalAttributes).length === 0
                ? {}
                : {
                      additionalPackageJsonAttributes:
                          config.commonAdditionalAttributes as AdditionalPackageJsonAttributes
                  })
        };

        return {
            registrySettings: { token: 'token' },
            commonPackageSettings,
            packages: [
                {
                    name: config.packageName,
                    entryPoints: [createEntryPoint(config.entryBaseName, config.declarationBaseName)],
                    ...(config.packageSourcesFolder === undefined
                        ? {}
                        : { sourcesFolder: config.packageSourcesFolder }),
                    mainPackageJson: config.packageMainType === undefined ? {} : { type: config.packageMainType },
                    ...(config.packageIncludeSourceMaps === undefined
                        ? {}
                        : { includeSourceMapFiles: config.packageIncludeSourceMaps }),
                    ...(config.packageAdditionalFileName === undefined
                        ? {}
                        : {
                              additionalFiles: [
                                  {
                                      sourceFilePath: `${config.packageAdditionalFileName}.md`,
                                      targetFilePath: `${config.packageAdditionalFileName}.md`
                                  }
                              ]
                          }),
                    ...(Object.keys(config.packageAdditionalAttributes).length === 0
                        ? {}
                        : {
                              additionalPackageJsonAttributes:
                                  config.packageAdditionalAttributes as AdditionalPackageJsonAttributes
                          }),
                    ...(config.dependencyNames.length === 0 ? {} : { bundleDependencies: config.dependencyNames })
                },
                ...config.dependencyNames.map((dependencyName) => {
                    return {
                        name: dependencyName,
                        entryPoints: [{ js: `${dependencyName}.js` }],
                        sourcesFolder: config.commonSourcesFolder ?? config.packageSourcesFolder ?? 'source',
                        mainPackageJson: {}
                    };
                })
            ]
        };
    });

test('packtoryConfigSchema accepts generated valid config shapes unchanged', () => {
    fc.assert(
        fc.property(validConfigArbitrary, (config) => {
            const typedConfig = config as unknown as PacktoryConfig;
            const result = safeParse(packtoryConfigSchema, typedConfig);

            assert.strictEqual(result.success, true);
            if (result.success) {
                assert.deepStrictEqual(result.data.registrySettings, typedConfig.registrySettings);
                assert.strictEqual(result.data.packages.length, config.packages.length);
                assert.deepStrictEqual(
                    result.data.packages.map((entry) => {
                        return entry.name;
                    }),
                    typedConfig.packages.map((entry) => {
                        return entry.name;
                    })
                );
                assert.deepStrictEqual(
                    result.data.packages.map((entry) => {
                        return entry.entryPoints;
                    }),
                    typedConfig.packages.map((entry) => {
                        return entry.entryPoints;
                    })
                );
                assert.deepStrictEqual(
                    result.data.packages.map((entry) => {
                        return entry.sourcesFolder;
                    }),
                    typedConfig.packages.map((entry) => {
                        return entry.sourcesFolder;
                    })
                );
                assert.deepStrictEqual(
                    result.data.packages.map((entry) => {
                        return entry.mainPackageJson;
                    }),
                    typedConfig.packages.map((entry) => {
                        return entry.mainPackageJson;
                    })
                );
                assert.deepStrictEqual(
                    result.data.commonPackageSettings?.sourcesFolder,
                    typedConfig.commonPackageSettings?.sourcesFolder
                );
                assert.deepStrictEqual(
                    result.data.commonPackageSettings?.mainPackageJson,
                    typedConfig.commonPackageSettings?.mainPackageJson
                );
            }
        })
    );
});

test('configToResolveAndLinkOptions() keeps package-specific overrides over inherited common settings', () => {
    fc.assert(
        fc.property(validConfigArbitrary, (config) => {
            const typedConfig = config as unknown as PacktoryConfig;
            const [packageConfig] = typedConfig.packages;
            if (packageConfig === undefined) {
                assert.fail('Expected a package configuration');
            }
            const existingBundles = (packageConfig.bundleDependencies ?? []).map((dependencyName) => {
                return { name: dependencyName, contents: [] };
            });

            const result = configToResolveAndLinkOptions(
                packageConfig.name,
                new Map(
                    typedConfig.packages.map((entry) => {
                        return [entry.name, entry];
                    })
                ),
                typedConfig,
                existingBundles
            );

            const expectedSourcesFolder =
                packageConfig.sourcesFolder ?? typedConfig.commonPackageSettings?.sourcesFolder;
            assert.strictEqual(result.sourcesFolder, expectedSourcesFolder);

            if (packageConfig.mainPackageJson === undefined) {
                assert.deepStrictEqual(result.mainPackageJson, typedConfig.commonPackageSettings?.mainPackageJson);
            } else {
                assert.deepStrictEqual(result.mainPackageJson, packageConfig.mainPackageJson);
            }

            if (packageConfig.includeSourceMapFiles !== undefined) {
                assert.strictEqual(result.includeSourceMapFiles, packageConfig.includeSourceMapFiles);
            }
        })
    );
});
