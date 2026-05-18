import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { validateConfig } from './validation.ts';

const packageNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}$/);

function createValidPackage(name: string) {
    return {
        name,
        sourcesFolder: `/src/${name}`,
        mainPackageJson: { type: 'module' },
        roots: { main: { js: `${name}.js` } }
    };
}

suite('validation', function () {
    test('validateConfig() returns Result.err for malformed non-config values', function () {
        fc.assert(
            fc.property(
                fc.oneof(fc.boolean(), fc.integer(), fc.string(), fc.constant(null), fc.constant(undefined)),
                (value) => {
                    const result = validateConfig(value);
                    assert.strictEqual(result.isErr, true);
                }
            )
        );
    });

    test('validateConfig() rejects configs with missing bundle dependencies', function () {
        fc.assert(
            fc.property(packageNameArbitrary, packageNameArbitrary, (packageName, missingDependencyName) => {
                fc.pre(packageName !== missingDependencyName);

                const result = validateConfig({
                    registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                    packages: [
                        {
                            ...createValidPackage(packageName),
                            bundleDependencies: [missingDependencyName]
                        }
                    ]
                });

                assert.strictEqual(result.isErr, true);
            })
        );
    });

    test('validateConfig() rejects duplicate package definitions and cyclic dependencies', function () {
        fc.assert(
            fc.property(packageNameArbitrary, packageNameArbitrary, (firstName, secondName) => {
                fc.pre(firstName !== secondName);

                const duplicateResult = validateConfig({
                    registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                    packages: [createValidPackage(firstName), createValidPackage(firstName)]
                });
                assert.strictEqual(duplicateResult.isErr, true);

                const cyclicResult = validateConfig({
                    registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                    packages: [
                        {
                            ...createValidPackage(firstName),
                            bundleDependencies: [secondName]
                        },
                        {
                            ...createValidPackage(secondName),
                            bundleDependencies: [firstName]
                        }
                    ]
                });
                assert.strictEqual(cyclicResult.isErr, true);
            })
        );
    });
});
