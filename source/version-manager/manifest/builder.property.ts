import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { hasProp } from 'remeda';
import type { AdditionalPackageJsonAttributes } from '../../config/package-json.ts';
import type { VersionedBundle } from '../versioned-bundle.ts';
import { buildPackageManifest } from './builder.ts';

const reservedAttributeNames = new Set([
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
]);

const packageNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const filePathArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}\.(?:js|d\.ts)$/);
const versionArbitrary = fc
    .tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }))
    .map(function ([ major, minor, patch ]) {
        return `${major}.${minor}.${patch}`;
    });
const dependencyRecordArbitrary = fc.dictionary(packageNameArbitrary, versionArbitrary, { maxKeys: 3 });
const additionalAttributeKeyArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,10}$/).filter(function (key) {
    return !reservedAttributeNames.has(key);
});

const additionalAttributesArbitrary: fc.Arbitrary<AdditionalPackageJsonAttributes> = fc.dictionary(
    additionalAttributeKeyArbitrary,
    fc.jsonValue(),
    { maxKeys: 3 }
) as fc.Arbitrary<AdditionalPackageJsonAttributes>;

type PackageManifest = ReturnType<typeof buildPackageManifest>;

const bundleArbitrary: fc.Arbitrary<VersionedBundle> = fc
    .record({
        name: packageNameArbitrary,
        version: versionArbitrary,
        dependencies: dependencyRecordArbitrary,
        peerDependencies: dependencyRecordArbitrary,
        additionalAttributes: additionalAttributesArbitrary,
        packageType: fc.constant<'module'>('module'),
        mainTargetFilePath: filePathArbitrary,
        typesTargetFilePath: fc.option(fc.stringMatching(/^[a-z][\da-z-]{0,7}\.d\.ts$/), { nil: undefined })
    })
    .filter(function (bundle) {
        return Object.keys(bundle.dependencies).every(function (name) {
            return !hasProp(bundle.peerDependencies, name);
        });
    })
    .map(function (bundle): VersionedBundle {
        return {
            name: bundle.name,
            version: bundle.version,
            dependencies: bundle.dependencies,
            peerDependencies: bundle.peerDependencies,
            additionalAttributes: bundle.additionalAttributes,
            contents: [],
            roots: {
                main: {
                    js: {
                        sourceFilePath: `/src/${bundle.mainTargetFilePath}`,
                        targetFilePath: bundle.mainTargetFilePath,
                        content: '',
                        isExecutable: false
                    },
                    ...bundle.typesTargetFilePath !== undefined && {
                        declarationFile: {
                            sourceFilePath: `/src/${bundle.typesTargetFilePath}`,
                            targetFilePath: bundle.typesTargetFilePath,
                            content: '',
                            isExecutable: false
                        }
                    }
                }
            },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' as const },
            exportsField: {
                '.': {
                    import: `./${bundle.mainTargetFilePath}`,
                    ...bundle.typesTargetFilePath !== undefined && { types: `./${bundle.typesTargetFilePath}` }
                }
            },
            mainFile: {
                sourceFilePath: `/src/${bundle.mainTargetFilePath}`,
                targetFilePath: bundle.mainTargetFilePath,
                content: '',
                isExecutable: false
            },
            typesMainFile: bundle.typesTargetFilePath === undefined
                ? undefined
                : {
                    sourceFilePath: `/src/${bundle.typesTargetFilePath}`,
                    targetFilePath: bundle.typesTargetFilePath,
                    content: '',
                    isExecutable: false
                },
            packageType: bundle.packageType,
            sideEffectsField: undefined
        };
    });

function assertManifestDependencyGroup(
    manifest: PackageManifest,
    fieldName: 'dependencies' | 'peerDependencies',
    expected: Readonly<Record<string, string>>
): void {
    if (Object.keys(expected).length === 0) {
        assert.strictEqual(Object.hasOwn(manifest, fieldName), false);
        return;
    }
    assert.deepStrictEqual(manifest[fieldName], expected);
}

suite('builder', function () {
    test('buildPackageManifest() keeps generated manifest fields coherent with the bundle inputs', function () {
        fc.assert(
            fc.property(bundleArbitrary, function (bundle) {
                const manifest = buildPackageManifest(bundle);

                assert.strictEqual(manifest.name, bundle.name);
                assert.strictEqual(manifest.version, bundle.version);
                assert.deepStrictEqual(manifest.exports, bundle.exportsField);
                assert.strictEqual(manifest.type, bundle.packageType);
                assertManifestDependencyGroup(manifest, 'dependencies', bundle.dependencies);
                assertManifestDependencyGroup(manifest, 'peerDependencies', bundle.peerDependencies);
            })
        );
    });

    test('buildPackageManifest() preserves additional attributes without leaking dependency groups into each other', function () {
        fc.assert(
            fc.property(bundleArbitrary, function (bundle) {
                const manifest = buildPackageManifest(bundle);

                Object.entries(bundle.additionalAttributes).forEach(function ([ key, value ]) {
                    assert.deepStrictEqual(manifest[key], value);
                });

                Object.keys(bundle.dependencies).forEach(function (dependencyName) {
                    assert.strictEqual(hasProp(manifest.peerDependencies ?? {}, dependencyName), false);
                });
                Object.keys(bundle.peerDependencies).forEach(function (dependencyName) {
                    assert.strictEqual(hasProp(manifest.dependencies ?? {}, dependencyName), false);
                });
            })
        );
    });
});
