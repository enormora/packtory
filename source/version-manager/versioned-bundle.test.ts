import assert from 'node:assert';
import { test } from 'mocha';
import {
    externalDependency as createReferencedDependency,
    linkedBundle as createLinkedBundle,
    versionedBundle
} from '../test-libraries/bundle-fixtures.ts';
import { buildVersionedBundle } from './versioned-bundle.ts';

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
                ['bundle-dependency', createReferencedDependency('bundle-dependency')],
                ['peer-dependency', createReferencedDependency('peer-dependency')]
            ])
        }),
        version: '1.2.3',
        mainPackageJson: { type: 'module' },
        bundleDependencies: [
            versionedBundle({
                name: 'bundle-dependency',
                version: '2.0.0',
                mainFile: { sourceFilePath: '/src/dep.js', targetFilePath: 'dep.js' }
            })
        ],
        bundlePeerDependencies: [
            versionedBundle({
                name: 'peer-dependency',
                version: '3.0.0',
                mainFile: { sourceFilePath: '/src/peer.js', targetFilePath: 'peer.js' }
            })
        ],
        additionalPackageJsonAttributes: {}
    });

    assert.deepStrictEqual(result.dependencies, { 'bundle-dependency': '2.0.0' });
    assert.deepStrictEqual(result.peerDependencies, { 'peer-dependency': '3.0.0' });
});

test('buildVersionedBundle() defaults both dependency maps to empty objects when there are no dependencies', () => {
    const result = buildVersionedBundle({
        bundle: createLinkedBundle(),
        version: '1.2.3',
        mainPackageJson: { type: 'module' },
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {}
    });

    assert.deepStrictEqual(result.dependencies, {});
    assert.deepStrictEqual(result.peerDependencies, {});
});

test('buildVersionedBundle() reads external dependency versions from dependencies and peerDependencies', () => {
    const result = buildVersionedBundle({
        bundle: createLinkedBundle({
            externalDependencies: new Map([
                ['left-pad', createReferencedDependency('left-pad')],
                ['react', createReferencedDependency('react')]
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

function expectBuildVersionedBundleToThrow(
    bundle: ReturnType<typeof createLinkedBundle>,
    expectedMessage: string
): void {
    try {
        buildVersionedBundle({
            bundle,
            version: '1.2.3',
            mainPackageJson: { type: 'module' },
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {}
        });
        assert.fail('Expected buildVersionedBundle() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

test('buildVersionedBundle() throws when a bundle dependency version is missing', () => {
    expectBuildVersionedBundleToThrow(
        createLinkedBundle({
            linkedBundleDependencies: new Map([['bundle-dependency', createReferencedDependency('bundle-dependency')]])
        }),
        'Couldn’t determine version number of bundle dependency bundle-dependency'
    );
});

test('buildVersionedBundle() throws when an external dependency version is missing from the main package.json', () => {
    expectBuildVersionedBundleToThrow(
        createLinkedBundle({
            externalDependencies: new Map([['left-pad', createReferencedDependency('left-pad')]])
        }),
        'Couldn’t determine version number of left-pad, because it is not listed in the main package.json'
    );
});

test('buildVersionedBundle() prefers peerDependencies over dependencies when the same external dependency exists in both', () => {
    const result = buildVersionedBundle({
        bundle: createLinkedBundle({
            externalDependencies: new Map([['react', createReferencedDependency('react')]])
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
