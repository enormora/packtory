import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { createPacktoryToolVersionResolver } from './tool-version.ts';

const unresolvableExpectedMessage =
    'Cannot determine packtory tool version: neither "@packtory/cli" nor "packtory" is resolvable.' +
    ' Install packtory via npm so it lives under node_modules/.';

type FactoryOverrides = {
    readonly importPackageJson?: SinonSpy;
};

type PackageJsonSpec = {
    readonly name: string;
    readonly version: string;
};
type PackageJsonImport = PackageJsonSpec | { readonly default: PackageJsonSpec; };

type ExpectedResolution = {
    readonly importPackageJson: SinonSpy;
    readonly expectedVersion: string;
};

type ExpectedResolutionError = {
    readonly importPackageJson: SinonSpy;
    readonly expectedMessage: string;
};
type ResolverFixture = {
    readonly importPackageJson: SinonSpy;
    readonly resolve: () => Promise<string>;
};

function createResolver(overrides: FactoryOverrides = {}): ResolverFixture {
    const importPackageJson = overrides.importPackageJson ??
        fake.rejects(Object.assign(new Error('missing'), { code: 'ERR_MODULE_NOT_FOUND' }));
    const resolve = createPacktoryToolVersionResolver({ importPackageJson });
    return { resolve, importPackageJson };
}

function createJsonImporter(
    specifier: string,
    packageJson: PackageJsonImport
): SinonSpy {
    return fake(async function (candidateSpecifier: string) {
        if (candidateSpecifier === specifier) {
            return packageJson;
        }
        throw Object.assign(new Error(`Cannot resolve ${candidateSpecifier}`), {
            code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
        });
    });
}

function createPacktoryFallbackImporter(): SinonSpy {
    return fake(async function (specifier: string) {
        if (specifier === '@packtory/cli/package.json') {
            throw Object.assign(new Error(`Cannot resolve ${specifier}`), {
                code: 'ERR_MODULE_NOT_FOUND'
            });
        }
        if (specifier === 'packtory/package.json') {
            return { default: { name: 'packtory', version: '4.5.6' } };
        }
        throw new Error(`Unexpected specifier: ${specifier}`);
    });
}

async function expectResolvedVersion(expectedResolution: ExpectedResolution): Promise<void> {
    const { importPackageJson, expectedVersion } = expectedResolution;
    const { resolve } = createResolver({ importPackageJson });

    const result = await resolve();

    assert.strictEqual(result, expectedVersion);
}

async function expectResolutionError(expectedResolutionError: ExpectedResolutionError): Promise<void> {
    const { importPackageJson, expectedMessage } = expectedResolutionError;
    const { resolve } = createResolver({ importPackageJson });

    try {
        await resolve();
        assert.fail('Expected resolve() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('tool-version', function () {
    suite('successful resolution', function () {
        test('returns the version from @packtory/cli when its package.json resolves inside node_modules', async function () {
            await expectResolvedVersion({
                importPackageJson: createJsonImporter('@packtory/cli/package.json', {
                    default: { name: '@packtory/cli', version: '1.2.3' }
                }),
                expectedVersion: '1.2.3'
            });
        });

        test('falls back to packtory when @packtory/cli is not resolvable', async function () {
            await expectResolvedVersion({
                importPackageJson: createJsonImporter('packtory/package.json', {
                    default: { name: 'packtory', version: '4.5.6' }
                }),
                expectedVersion: '4.5.6'
            });
        });

        test('falls back to packtory when @packtory/cli is missing from node_modules entirely', async function () {
            await expectResolvedVersion({
                importPackageJson: createPacktoryFallbackImporter(),
                expectedVersion: '4.5.6'
            });
        });

        test('accepts package.json imports that resolve directly without a default wrapper', async function () {
            await expectResolvedVersion({
                importPackageJson: createJsonImporter('@packtory/cli/package.json', {
                    name: '@packtory/cli',
                    version: '7.8.9'
                }),
                expectedVersion: '7.8.9'
            });
        });
    });

    suite('resolution failures', function () {
        test('throws when neither @packtory/cli nor packtory can be resolved', async function () {
            await expectResolutionError({
                importPackageJson: fake.rejects(
                    Object.assign(new Error('missing'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
                ),
                expectedMessage: unresolvableExpectedMessage
            });
        });

        test('rethrows errors that are not import-resolution errors', async function () {
            const expectedError = Object.assign(new Error('boom'), { code: 'SOMETHING_ELSE' });
            const importPackageJson = fake.rejects(expectedError);
            const { resolve } = createResolver({ importPackageJson });

            try {
                await resolve();
                assert.fail('Expected resolve() to throw but it did not');
            } catch (error: unknown) {
                assert.strictEqual(error, expectedError);
            }

            assertDeepSubset(importPackageJson, {
                callCount: 1,
                firstCall: {
                    args: [ '@packtory/cli/package.json' ]
                }
            });
        });

        test('rethrows non-object import failures instead of treating them as resolution errors', async function () {
            const rejectPromise = Reflect.get(Promise, 'reject').bind(Promise) as (reason: unknown) => Promise<never>;
            const importPackageJson = fake(async function () {
                return await rejectPromise('boom');
            });
            const { resolve } = createResolver({ importPackageJson });

            try {
                await resolve();
                assert.fail('Expected resolve() to throw but it did not');
            } catch (error: unknown) {
                assert.strictEqual(error, 'boom');
            }

            assertDeepSubset(importPackageJson, {
                callCount: 1,
                firstCall: {
                    args: [ '@packtory/cli/package.json' ]
                }
            });
        });

        test('rethrows null import failures instead of treating them as resolution errors', async function () {
            const rejectPromise = Reflect.get(Promise, 'reject').bind(Promise) as (reason: unknown) => Promise<never>;
            const importPackageJson = fake(async function () {
                return await rejectPromise(null);
            });
            const { resolve } = createResolver({ importPackageJson });

            try {
                await resolve();
                assert.fail('Expected resolve() to throw but it did not');
            } catch (error: unknown) {
                assert.strictEqual(error, null);
            }

            assertDeepSubset(importPackageJson, {
                callCount: 1,
                firstCall: {
                    args: [ '@packtory/cli/package.json' ]
                }
            });
        });

        test('throws when the imported package.json has an unexpected package name', async function () {
            await expectResolutionError({
                importPackageJson: createJsonImporter('packtory/package.json', {
                    default: { name: 'not-packtory', version: '1.2.3' }
                }),
                expectedMessage:
                    'Imported packtory package.json from "packtory/package.json" has unexpected package name'
            });
        });

        test('throws when the imported package.json has no version field', async function () {
            await expectResolutionError({
                importPackageJson: fake(async function (specifier: string) {
                    if (specifier === 'packtory/package.json') {
                        return { default: { name: 'packtory' } };
                    }
                    throw Object.assign(new Error(`Cannot resolve ${specifier}`), {
                        code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
                    });
                }),
                expectedMessage:
                    'Imported packtory package.json from "packtory/package.json" is missing a version field'
            });
        });

        test('throws when the imported package.json module shape is malformed', async function () {
            await expectResolutionError({
                importPackageJson: fake(async function (specifier: string) {
                    if (specifier === '@packtory/cli/package.json') {
                        return null;
                    }
                    throw Object.assign(new Error(`Cannot resolve ${specifier}`), {
                        code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
                    });
                }),
                expectedMessage:
                    'Imported packtory package.json from "@packtory/cli/package.json" is missing a version field'
            });
        });
    });
});
