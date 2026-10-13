import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { hasProp as hasProperty } from 'remeda';
import type { AdditionalPackageManifestAttributes } from '../../configuration/package-manifest.ts';
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

const packageNameArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}$/);
const filePathArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}\.(?:js|d\.ts)$/);
const versionArbitrary = fastCheck
    .tuple(
        fastCheck.integer({ min: 0, max: 9 }),
        fastCheck.integer({ min: 0, max: 9 }),
        fastCheck.integer({ min: 0, max: 9 })
    )
    .map(function ([ major, minor, patch ]) {
        return `${major}.${minor}.${patch}`;
    });
const dependencyRecordArbitrary = fastCheck.dictionary(packageNameArbitrary, versionArbitrary, { maxKeys: 3 });
const additionalAttributeKeyArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,10}$/).filter(function (key) {
    return !reservedAttributeNames.has(key);
});

const additionalAttributesArbitrary: fastCheck.Arbitrary<AdditionalPackageManifestAttributes> = fastCheck.dictionary(
    additionalAttributeKeyArbitrary,
    fastCheck.jsonValue(),
    { maxKeys: 3 }
) as fastCheck.Arbitrary<AdditionalPackageManifestAttributes>;

type PackageManifest = ReturnType<typeof buildPackageManifest>;

const bundleArbitrary: fastCheck.Arbitrary<VersionedBundle> = fastCheck
    .record({
        name: packageNameArbitrary,
        version: versionArbitrary,
        dependencies: dependencyRecordArbitrary,
        peerDependencies: dependencyRecordArbitrary,
        additionalAttributes: additionalAttributesArbitrary,
        packageType: fastCheck.constant<'module'>('module'),
        mainTargetFilePath: filePathArbitrary,
        typesTargetFilePath: fastCheck.option(fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}\.d\.ts$/), {
            nil: undefined
        })
    })
    .filter(function (bundle) {
        return Object.keys(bundle.dependencies).every(function (name) {
            return !hasProperty(bundle.peerDependencies, name);
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
                    javaScript: {
                        inputFilePath: `/source/${bundle.mainTargetFilePath}`,
                        targetFilePath: bundle.mainTargetFilePath,
                        content: '',
                        isExecutable: false
                    },
                    ...bundle.typesTargetFilePath === undefined ? {} : {
                        declarationFile: {
                            inputFilePath: `/source/${bundle.typesTargetFilePath}`,
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
                    ...bundle.typesTargetFilePath === undefined ? {} : { types: `./${bundle.typesTargetFilePath}` }
                }
            },
            mainFile: {
                inputFilePath: `/source/${bundle.mainTargetFilePath}`,
                targetFilePath: bundle.mainTargetFilePath,
                content: '',
                isExecutable: false
            },
            typesMainFile: bundle.typesTargetFilePath === undefined
                ? undefined
                : {
                    inputFilePath: `/source/${bundle.typesTargetFilePath}`,
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
        fastCheck.assert(
            fastCheck.property(bundleArbitrary, function (bundle) {
                const manifest = buildPackageManifest(bundle);

                assert.partialDeepStrictEqual(manifest, {
                    name: bundle.name,
                    version: bundle.version,
                    exports: bundle.exportsField,
                    type: bundle.packageType
                });
                assertManifestDependencyGroup(manifest, 'dependencies', bundle.dependencies);
                assertManifestDependencyGroup(manifest, 'peerDependencies', bundle.peerDependencies);
            })
        );
    });

    test('buildPackageManifest() preserves additional attributes without leaking dependency groups into each other', function () {
        fastCheck.assert(
            fastCheck.property(bundleArbitrary, function (bundle) {
                const manifest = buildPackageManifest(bundle);

                Object.entries(bundle.additionalAttributes).forEach(function ([ key, value ]) {
                    assert.deepStrictEqual(manifest[key], value);
                });

                Object.keys(bundle.dependencies).forEach(function (dependencyName) {
                    assert.strictEqual(hasProperty(manifest.peerDependencies ?? {}, dependencyName), false);
                });
                Object.keys(bundle.peerDependencies).forEach(function (dependencyName) {
                    assert.strictEqual(hasProperty(manifest.dependencies ?? {}, dependencyName), false);
                });
            })
        );
    });
});
