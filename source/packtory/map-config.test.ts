import test from 'ava';
import { configToBuildAndPublishOptions } from './map-config.js';

test('throws when the given packageName doesn’t exist in the configs', (t) => {
    t.throws(
        () => {
            configToBuildAndPublishOptions(
                'foo',
                new Map(),
                {
                    registrySettings: { token: '' },
                    packages: [{ name: '', sourcesFolder: '', entryPoints: [{ js: '' }], mainPackageJson: {} }]
                },
                []
            );
        },
        { message: 'Config for package "foo" is missing' }
    );
});

test('doesn’t change js entryPoints when they are already absolute paths', (t) => {
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

    t.deepEqual(result.entryPoints, [{ js: '/the-entry-file' }]);
});

test('adds the sourcesFolder as a prefix to a js entryPoint when it is a relative path', (t) => {
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

    t.deepEqual(result.entryPoints, [{ js: 'the-source/the-entry-file' }]);
});

test('doesn’t change declarationFile entryPoints when they are already absolute paths', (t) => {
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

    t.deepEqual(result.entryPoints, [{ js: '/js-file', declarationFile: '/declaration-file' }]);
});

test('adds the sourcesFolder as a prefix to a declarationFile entryPoint when it is a relative path', (t) => {
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

    t.deepEqual(result.entryPoints, [{ js: '/js-file', declarationFile: 'the-source/declaration-file' }]);
});

test('doesn’t change an additionalFile sourcePathFile when it is already an absolute path', (t) => {
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

    t.deepEqual(result.additionalFiles, [{ sourceFilePath: '/foo', targetFilePath: 'bar' }]);
});

test('adds the sourceFolder as prefix to an additionalFile sourcePathFile when it is a relative path', (t) => {
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

    t.deepEqual(result.additionalFiles, [{ sourceFilePath: 'the-source/foo', targetFilePath: 'bar' }]);
});
