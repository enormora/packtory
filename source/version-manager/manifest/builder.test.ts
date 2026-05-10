import assert from 'node:assert';
import { test } from 'mocha';
import type { VersionedBundle } from '../versioned-bundle.ts';
import { buildPackageManifest } from './builder.ts';

function createBundle(overrides: Partial<VersionedBundle> = {}): VersionedBundle {
    return {
        name: 'package-a',
        version: '1.2.3',
        dependencies: {},
        peerDependencies: {},
        mainFile: {
            sourceFilePath: '/src/index.js',
            targetFilePath: 'index.js',
            content: '',
            isExecutable: false
        },
        additionalAttributes: {},
        contents: [],
        packageType: 'module',
        sideEffectsField: undefined,
        ...overrides
    };
}

test('buildPackageManifest() omits optional fields when they are empty or undefined', () => {
    const result = buildPackageManifest(createBundle());

    assert.deepStrictEqual(result, {
        name: 'package-a',
        version: '1.2.3',
        main: 'index.js',
        type: 'module'
    });
});

test('buildPackageManifest() includes dependency, peer dependency, type, and types fields', () => {
    const result = buildPackageManifest(
        createBundle({
            dependencies: { leftPad: '^1.0.0' },
            peerDependencies: { react: '^19.0.0' },
            packageType: 'module',
            typesMainFile: {
                sourceFilePath: '/src/index.d.ts',
                targetFilePath: 'index.d.ts',
                content: '',
                isExecutable: false
            }
        })
    );

    assert.deepStrictEqual(result, {
        name: 'package-a',
        version: '1.2.3',
        main: 'index.js',
        dependencies: { leftPad: '^1.0.0' },
        peerDependencies: { react: '^19.0.0' },
        type: 'module',
        types: 'index.d.ts'
    });
});

test('buildPackageManifest() passes through a scripts block from additional attributes', () => {
    const result = buildPackageManifest(
        createBundle({
            additionalAttributes: { scripts: { postinstall: 'echo hi' } }
        })
    );

    assert.deepStrictEqual(result, {
        name: 'package-a',
        version: '1.2.3',
        main: 'index.js',
        type: 'module',
        scripts: { postinstall: 'echo hi' }
    });
});

test('buildPackageManifest() lets generated manifest fields override conflicting additional attributes', () => {
    const result = buildPackageManifest(
        createBundle({
            additionalAttributes: {
                name: 'wrong-name',
                version: '0.0.0',
                customField: true
            }
        })
    );

    assert.deepStrictEqual(result, {
        name: 'package-a',
        version: '1.2.3',
        main: 'index.js',
        type: 'module',
        customField: true
    });
});

test('buildPackageManifest() omits sideEffects when the bundle has no auto-detected value', () => {
    const result = buildPackageManifest(createBundle());

    assert.strictEqual('sideEffects' in result, false);
});

test('buildPackageManifest() emits "sideEffects": false when the auto-detected value is false', () => {
    const result = buildPackageManifest(createBundle({ sideEffectsField: false }));

    assert.strictEqual(result.sideEffects, false);
});

test('buildPackageManifest() emits the auto-detected file list as "sideEffects"', () => {
    const result = buildPackageManifest(createBundle({ sideEffectsField: ['./impure.js'] }));

    assert.deepStrictEqual(result.sideEffects, ['./impure.js']);
});

test('buildPackageManifest() prefers a user-provided sideEffects value in additionalAttributes over the auto-detected one', () => {
    const result = buildPackageManifest(
        createBundle({
            additionalAttributes: { sideEffects: true },
            sideEffectsField: false
        })
    );

    assert.strictEqual(result.sideEffects, true);
});

test('buildPackageManifest() preserves a user-provided sideEffects array even when auto-detection would emit different values', () => {
    const result = buildPackageManifest(
        createBundle({
            additionalAttributes: { sideEffects: ['./vendor/setup.js'] },
            sideEffectsField: ['./other.js']
        })
    );

    assert.deepStrictEqual(result.sideEffects, ['./vendor/setup.js']);
});
