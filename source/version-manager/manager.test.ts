import assert from 'node:assert';
import { test } from 'mocha';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, externalDependency, versionedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createVersionManager } from './manager.ts';

function createAnalyzedBundle(): AnalyzedBundle {
    return analyzedBundle({
        linkedBundleDependencies: new Map([['bundle-dependency', externalDependency('bundle-dependency')]]),
        externalDependencies: new Map([['left-pad', externalDependency('left-pad')]])
    });
}

test('addVersion() creates the versioned bundle and manifest file', () => {
    const manager = createVersionManager({
        progressBroadcaster: {
            emit: (): void => undefined,
            hasSubscribers: (): boolean => false
        }
    });

    const result = manager.addVersion({
        bundle: createAnalyzedBundle(),
        version: '1.2.3',
        mainPackageJson: { type: 'module', dependencies: { 'left-pad': '^1.0.0' } },
        bundleDependencies: [
            versionedBundle({
                name: 'bundle-dependency',
                version: '4.5.6',
                mainFile: { sourceFilePath: '/src/dep.js', targetFilePath: 'dep.js' }
            })
        ],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: { publishConfig: { access: 'public' } },
        allowMutableSpecifiers: []
    });

    assert.deepStrictEqual(result.packageJson, {
        name: 'package-a',
        version: '1.2.3',
        main: 'index.js',
        types: 'index.d.ts',
        type: 'module',
        dependencies: { 'bundle-dependency': '4.5.6', 'left-pad': '^1.0.0' },
        publishConfig: { access: 'public' }
    });
    assert.deepStrictEqual(result.manifestFile, {
        filePath: 'package.json',
        isExecutable: false,
        content: [
            '{',
            '    "dependencies": {',
            '        "bundle-dependency": "4.5.6",',
            '        "left-pad": "^1.0.0"',
            '    },',
            '    "main": "index.js",',
            '    "name": "package-a",',
            '    "publishConfig": {',
            '        "access": "public"',
            '    },',
            '    "type": "module",',
            '    "types": "index.d.ts",',
            '    "version": "1.2.3"',
            '}'
        ].join('\n')
    });
});

test('increaseVersion() bumps the patch version and rebuilds the package manifest', () => {
    const manager = createVersionManager({
        progressBroadcaster: {
            emit: (): void => undefined,
            hasSubscribers: (): boolean => false
        }
    });

    const result = manager.increaseVersion({
        name: 'package-a',
        version: '1.2.3',
        contents: [],
        dependencies: { dep: '^1.0.0' },
        peerDependencies: { react: '^19.0.0' },
        additionalAttributes: {},
        mainFile: {
            sourceFilePath: '/src/index.js',
            targetFilePath: 'index.js',
            content: '',
            isExecutable: false
        },
        typesMainFile: {
            sourceFilePath: '/src/index.d.ts',
            targetFilePath: 'index.d.ts',
            content: '',
            isExecutable: false
        },
        packageType: 'module',
        sideEffectsField: undefined
    });

    assert.strictEqual(result.version, '1.2.4');
    assert.deepStrictEqual(result.packageJson, {
        name: 'package-a',
        version: '1.2.4',
        main: 'index.js',
        types: 'index.d.ts',
        type: 'module',
        dependencies: { dep: '^1.0.0' },
        peerDependencies: { react: '^19.0.0' }
    });
    assert.deepStrictEqual(result.manifestFile, {
        filePath: 'package.json',
        isExecutable: false,
        content: [
            '{',
            '    "dependencies": {',
            '        "dep": "^1.0.0"',
            '    },',
            '    "main": "index.js",',
            '    "name": "package-a",',
            '    "peerDependencies": {',
            '        "react": "^19.0.0"',
            '    },',
            '    "type": "module",',
            '    "types": "index.d.ts",',
            '    "version": "1.2.4"',
            '}'
        ].join('\n')
    });
});

test('increaseVersion() throws when the given version is invalid', () => {
    const manager = createVersionManager({
        progressBroadcaster: {
            emit: (): void => undefined,
            hasSubscribers: (): boolean => false
        }
    });

    try {
        manager.increaseVersion({
            name: 'package-a',
            version: 'not-a-semver',
            contents: [],
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: {
                sourceFilePath: '/src/index.js',
                targetFilePath: 'index.js',
                content: '',
                isExecutable: false
            },
            packageType: 'module',
            sideEffectsField: undefined
        });
        assert.fail('Expected increaseVersion() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to increase version');
    }
});
