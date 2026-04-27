import assert from 'node:assert';
import { test } from 'mocha';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { buildVersionedBundle } from './versioned-bundle.ts';

function createLinkedBundle(overrides: Partial<LinkedBundle> = {}): LinkedBundle {
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
        linkedBundleDependencies: new Map(),
        externalDependencies: new Map(),
        ...overrides
    };
}

test('buildVersionedBundle() uses the first entry point as the main and types files', () => {
    const result = buildVersionedBundle({
        bundle: createLinkedBundle(),
        version: '1.2.3',
        mainPackageJson: { type: 'module' },
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: { custom: true }
    });

    assert.deepStrictEqual(result, {
        name: 'package-a',
        version: '1.2.3',
        dependencies: {},
        peerDependencies: {},
        contents: [],
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
        additionalAttributes: { custom: true },
        packageType: 'module'
    });
});

test('buildVersionedBundle() groups bundle dependencies and peer dependencies by package name', () => {
    const result = buildVersionedBundle({
        bundle: createLinkedBundle({
            linkedBundleDependencies: new Map([
                ['bundle-dependency', { name: 'bundle-dependency', referencedFrom: [] }],
                ['peer-dependency', { name: 'peer-dependency', referencedFrom: [] }]
            ])
        }),
        version: '1.2.3',
        mainPackageJson: { type: 'module' },
        bundleDependencies: [
            {
                name: 'bundle-dependency',
                version: '2.0.0',
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
        bundlePeerDependencies: [
            {
                name: 'peer-dependency',
                version: '3.0.0',
                contents: [],
                dependencies: {},
                peerDependencies: {},
                additionalAttributes: {},
                mainFile: {
                    sourceFilePath: '/src/peer.js',
                    targetFilePath: 'peer.js',
                    content: '',
                    isExecutable: false
                },
                packageType: 'module'
            }
        ],
        additionalPackageJsonAttributes: {}
    });

    assert.deepStrictEqual(result.dependencies, { 'bundle-dependency': '2.0.0' });
    assert.deepStrictEqual(result.peerDependencies, { 'peer-dependency': '3.0.0' });
});

test('buildVersionedBundle() reads external dependency versions from dependencies and peerDependencies', () => {
    const result = buildVersionedBundle({
        bundle: createLinkedBundle({
            externalDependencies: new Map([
                ['left-pad', { name: 'left-pad', referencedFrom: [] }],
                ['react', { name: 'react', referencedFrom: [] }]
            ])
        }),
        version: '1.2.3',
        mainPackageJson: {
            type: 'module',
            dependencies: { 'left-pad': '^1.0.0' },
            peerDependencies: { react: '^19.0.0' }
        },
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {}
    });

    assert.deepStrictEqual(result.dependencies, { 'left-pad': '^1.0.0' });
    assert.deepStrictEqual(result.peerDependencies, { react: '^19.0.0' });
});

test('buildVersionedBundle() throws when a bundle dependency version is missing', () => {
    try {
        buildVersionedBundle({
            bundle: createLinkedBundle({
                linkedBundleDependencies: new Map([
                    ['bundle-dependency', { name: 'bundle-dependency', referencedFrom: [] }]
                ])
            }),
            version: '1.2.3',
            mainPackageJson: { type: 'module' },
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {}
        });
        assert.fail('Expected buildVersionedBundle() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Couldn’t determine version number of bundle dependency bundle-dependency'
        );
    }
});

test('buildVersionedBundle() throws when an external dependency version is missing from the main package.json', () => {
    try {
        buildVersionedBundle({
            bundle: createLinkedBundle({
                externalDependencies: new Map([['left-pad', { name: 'left-pad', referencedFrom: [] }]])
            }),
            version: '1.2.3',
            mainPackageJson: { type: 'module' },
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {}
        });
        assert.fail('Expected buildVersionedBundle() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Couldn’t determine version number of left-pad, because it is not listed in the main package.json'
        );
    }
});

test('buildVersionedBundle() prefers peerDependencies over dependencies when the same external dependency exists in both', () => {
    const result = buildVersionedBundle({
        bundle: createLinkedBundle({
            externalDependencies: new Map([['react', { name: 'react', referencedFrom: [] }]])
        }),
        version: '1.2.3',
        mainPackageJson: {
            type: 'module',
            dependencies: { react: '^18.0.0' },
            peerDependencies: { react: '^19.0.0' }
        },
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {}
    });

    assert.deepStrictEqual(result.peerDependencies, { react: '^19.0.0' });
    assert.deepStrictEqual(result.dependencies, {});
});
