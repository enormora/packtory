/* eslint-disable @typescript-eslint/explicit-function-return-type -- small local test fixtures stay clearer without repetitive annotations */
import assert from 'node:assert';
import { test } from 'mocha';
import { createVersionManager } from './manager.ts';

function createLinkedBundle() {
    return {
        name: 'package-a',
        contents: [],
        entryPoints: [
            {
                js: {
                    sourceFilePath: '/src/index.js',
                    targetFilePath: 'index.js',
                    content: '',
                    isExecutable: false
                },
                declarationFile: {
                    sourceFilePath: '/src/index.d.ts',
                    targetFilePath: 'index.d.ts',
                    content: '',
                    isExecutable: false
                }
            }
        ] as const,
        linkedBundleDependencies: new Map([
            ['bundle-dependency', { name: 'bundle-dependency', referencedFrom: ['/src/index.js'] as const }]
        ]),
        externalDependencies: new Map([['left-pad', { name: 'left-pad', referencedFrom: ['/src/index.js'] as const }]])
    };
}

test('addVersion() creates the versioned bundle and manifest file', () => {
    const manager = createVersionManager();

    const result = manager.addVersion({
        bundle: createLinkedBundle(),
        version: '1.2.3',
        mainPackageJson: { type: 'module', dependencies: { 'left-pad': '^1.0.0' } },
        bundleDependencies: [
            {
                name: 'bundle-dependency',
                version: '4.5.6',
                contents: [],
                dependencies: {},
                peerDependencies: {},
                additionalAttributes: {},
                mainFile: {
                    sourceFilePath: '/src/dep.js',
                    targetFilePath: 'dep.js',
                    content: '',
                    isExecutable: false
                },
                packageType: 'module'
            }
        ],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: { publishConfig: { access: 'public' } }
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
    assert.strictEqual(result.manifestFile.filePath, 'package.json');
    assert.strictEqual(result.manifestFile.isExecutable, false);
});

test('increaseVersion() bumps the patch version and rebuilds the package manifest', () => {
    const manager = createVersionManager();

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
        packageType: 'module'
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
});

test('increaseVersion() throws when the given version is invalid', () => {
    const manager = createVersionManager();

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
            packageType: undefined
        });
        assert.fail('Expected increaseVersion() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to increase version');
    }
});
