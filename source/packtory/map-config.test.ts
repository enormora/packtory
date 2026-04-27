import assert from 'node:assert';
import { test } from 'mocha';
import { configToBuildAndPublishOptions } from './map-config.ts';

test('throws when the given packageName doesn’t exist in the configs', () => {
    try {
        configToBuildAndPublishOptions(
            'foo',
            new Map(),
            {
                registrySettings: { token: '' },
                packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
            },
            []
        );
        assert.fail('Expected configToBuildAndPublishOptions() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Config for package "foo" is missing');
    }
});

test('throws when the sourcesFolder is missing after config merging', () => {
    try {
        configToBuildAndPublishOptions(
            'foo',
            new Map([['foo', { name: 'foo', entryPoints: [{ js: '' }], mainPackageJson: {} }]]),
            {
                registrySettings: { token: '' },
                packages: [{ name: 'foo', entryPoints: [{ js: '' }], mainPackageJson: {} }]
            } as unknown as Parameters<typeof configToBuildAndPublishOptions>[2],
            []
        );
        assert.fail('Expected configToBuildAndPublishOptions() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Config for package "foo" is missing the sources folder');
    }
});

test('throws when the main package.json settings are missing after config merging', () => {
    try {
        configToBuildAndPublishOptions(
            'foo',
            new Map([['foo', { name: 'foo', sourcesFolder: '/src', entryPoints: [{ js: '' }] }]]),
            {
                registrySettings: { token: '' },
                packages: [{ name: 'foo', sourcesFolder: '/src', entryPoints: [{ js: '' }] }]
            } as unknown as Parameters<typeof configToBuildAndPublishOptions>[2],
            []
        );
        assert.fail('Expected configToBuildAndPublishOptions() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Config for package "foo" is missing the main package.json settings'
        );
    }
});

test('doesn’t change js entryPoints when they are already absolute paths', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '/the-entry-file' }],
        mainPackageJson: {}
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.entryPoints, [{ js: '/the-entry-file' }]);
});

test('adds the sourcesFolder as a prefix to a js entryPoint when it is a relative path', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: 'the-entry-file' }],
        mainPackageJson: {}
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.entryPoints, [{ js: 'the-source/the-entry-file' }]);
});

test('doesn’t change declarationFile entryPoints when they are already absolute paths', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '/js-file', declarationFile: '/declaration-file' }],
        mainPackageJson: {}
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.entryPoints, [{ js: '/js-file', declarationFile: '/declaration-file' }]);
});

test('adds the sourcesFolder as a prefix to a declarationFile entryPoint when it is a relative path', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '/js-file', declarationFile: 'declaration-file' }],
        mainPackageJson: {}
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.entryPoints, [{ js: '/js-file', declarationFile: 'the-source/declaration-file' }]);
});

test('doesn’t change an additionalFile sourcePathFile when it is already an absolute path', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        additionalFiles: [{ sourceFilePath: '/foo', targetFilePath: 'bar' }]
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: '/foo', targetFilePath: 'bar' }]);
});

test('adds the sourceFolder as prefix to an additionalFile sourcePathFile when it is a relative path', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'bar' }]
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }]);
});

test('throws an error when a bundle dependency does not exist', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        bundleDependencies: ['bar']
    } as const;

    try {
        configToBuildAndPublishOptions(
            'foo',
            new Map([['foo', packageConfig]]),
            {
                registrySettings: { token: '' },
                packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
            },
            []
        );
        assert.fail('Expected configToBuildAndPublishOptions() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Dependent bundle "bar" not found');
    }
});

test('maps the bundle dependency names correctly to the VersionedBundleWithManifest objects when it exists', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        bundleDependencies: ['bar']
    } as const;

    const options = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
        },
        [
            {
                contents: [],
                packageJson: { name: 'bar', version: '' },
                name: 'bar',
                version: '',
                dependencies: {},
                peerDependencies: {},
                additionalAttributes: {},
                mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
                packageType: 'module',
                manifestFile: { content: '', isExecutable: false, filePath: '' }
            }
        ]
    );

    assert.deepStrictEqual(options.bundleDependencies, [
        {
            contents: [],
            packageJson: { name: 'bar', version: '' },
            name: 'bar',
            version: '',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
            manifestFile: { content: '', filePath: '', isExecutable: false },
            packageType: 'module'
        }
    ]);
});

test('defaults the includeSourceMapFiles option to false when it is not in the package config nor in common settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {}
    } as const;

    const options = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
        },
        []
    );

    assert.strictEqual(options.includeSourceMapFiles, false);
});

test('sets the includeSourceMapFiles option to true when it is true in the per package config and not set in common settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        includeSourceMapFiles: true
    } as const;

    const options = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
        },
        []
    );

    assert.strictEqual(options.includeSourceMapFiles, true);
});

test('sets the includeSourceMapFiles option to true when it is not set in the per package config but set in common settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {}
    } as const;

    const options = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            commonPackageSettings: {
                includeSourceMapFiles: true
            },
            packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
        },
        []
    );

    assert.strictEqual(options.includeSourceMapFiles, true);
});

test('sets the includeSourceMapFiles option to false when it is set to false the per package config and set to true in the common settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        includeSourceMapFiles: false
    } as const;

    const options = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            commonPackageSettings: {
                includeSourceMapFiles: true
            },
            packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
        },
        []
    );

    assert.strictEqual(options.includeSourceMapFiles, false);
});

test('merges the additional files if they are set both in common settings and per package settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'bar' }]
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            commonPackageSettings: {
                additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'qux' }]
            },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalFiles, [
        { sourceFilePath: 'the-source/baz', targetFilePath: 'qux' },
        { sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }
    ]);
});

test('overwrites the additional files from common settings when a per package setting defines a file with the same target', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        additionalFiles: [{ sourceFilePath: 'foo', targetFilePath: 'bar' }]
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            commonPackageSettings: {
                additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'bar' }]
            },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }]);
});

test('uses only the additionalFiles from common settings when the per package settings don’t have additional files specified', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {}
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            commonPackageSettings: {
                additionalFiles: [{ sourceFilePath: 'baz', targetFilePath: 'bar' }]
            },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/baz', targetFilePath: 'bar' }]);
});

test('removes additional files which are duplicated by picking the last one', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        additionalFiles: [
            { sourceFilePath: 'foo', targetFilePath: 'bar' },
            { sourceFilePath: 'baz', targetFilePath: 'bar' }
        ]
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/baz', targetFilePath: 'bar' }]);
});

test('sets additionalPackageJsonAttributes to an empty object when they are not defined at all', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {}
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, {});
});

test('sets additionalPackageJsonAttributes to the value of the per package settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        additionalPackageJsonAttributes: { foo: 'bar' }
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar' });
});

test('sets additionalPackageJsonAttributes to the value of the common settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {}
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            commonPackageSettings: {
                additionalPackageJsonAttributes: { foo: 'bar' }
            },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar' });
});

test('merges additionalPackageJsonAttributes from per package and common settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        additionalPackageJsonAttributes: { baz: 'qux' }
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            commonPackageSettings: {
                additionalPackageJsonAttributes: { foo: 'bar' }
            },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'bar', baz: 'qux' });
});

test('overwrites additionalPackageJsonAttributes from common settings when there are also defined in per package settings', () => {
    const packageConfig = {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: [{ js: '' }],
        mainPackageJson: {},
        additionalPackageJsonAttributes: { foo: 'qux' }
    } as const;

    const result = configToBuildAndPublishOptions(
        'foo',
        new Map([['foo', packageConfig]]),
        {
            registrySettings: { token: '' },
            commonPackageSettings: {
                additionalPackageJsonAttributes: { foo: 'bar' }
            },
            packages: [packageConfig]
        },
        []
    );

    assert.deepStrictEqual(result.additionalPackageJsonAttributes, { foo: 'qux' });
});
