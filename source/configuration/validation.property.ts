import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { validateConfiguration } from './validation.ts';

const packageNameArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}$/);

type GeneratedPackageConfiguration = {
    readonly name: string;
    readonly sourcesFolder: string;
    readonly mainPackageManifest: { readonly type: 'module'; };
    readonly roots: { readonly main: { readonly javaScript: string; }; };
};

function createValidPackage(name: string): GeneratedPackageConfiguration {
    return {
        name,
        sourcesFolder: `/source/${name}`,
        mainPackageManifest: { type: 'module' },
        roots: { main: { javaScript: `${name}.js` } }
    };
}

suite('validation', function () {
    test('validateConfiguration() returns Result.err for malformed non-config values', function () {
        fastCheck.assert(
            fastCheck.property(
                fastCheck.oneof(
                    fastCheck.boolean(),
                    fastCheck.integer(),
                    fastCheck.string(),
                    fastCheck.constant(null),
                    fastCheck.constant(undefined)
                ),
                function (value) {
                    const result = validateConfiguration(value);
                    assert.strictEqual(result.isErr, true);
                }
            )
        );
    });

    test('validateConfiguration() rejects configs with missing bundle dependencies', function () {
        fastCheck.assert(
            fastCheck.property(
                packageNameArbitrary,
                packageNameArbitrary,
                function (packageName, missingDependencyName) {
                    fastCheck.pre(packageName !== missingDependencyName);

                    const result = validateConfiguration({
                        registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                        packages: [
                            {
                                ...createValidPackage(packageName),
                                bundleDependencies: [ missingDependencyName ]
                            }
                        ]
                    });

                    assert.strictEqual(result.isErr, true);
                }
            )
        );
    });

    test('validateConfiguration() rejects duplicate package definitions and cyclic dependencies', function () {
        fastCheck.assert(
            fastCheck.property(packageNameArbitrary, packageNameArbitrary, function (firstName, secondName) {
                fastCheck.pre(firstName !== secondName);

                const duplicateResult = validateConfiguration({
                    registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                    packages: [ createValidPackage(firstName), createValidPackage(firstName) ]
                });
                assert.strictEqual(duplicateResult.isErr, true);

                const cyclicResult = validateConfiguration({
                    registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                    packages: [
                        {
                            ...createValidPackage(firstName),
                            bundleDependencies: [ secondName ]
                        },
                        {
                            ...createValidPackage(secondName),
                            bundleDependencies: [ firstName ]
                        }
                    ]
                });
                assert.strictEqual(cyclicResult.isErr, true);
            })
        );
    });
});
