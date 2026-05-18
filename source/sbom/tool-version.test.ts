import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
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

type ExpectedResolution = {
    readonly importPackageJson: SinonSpy;
    readonly expectedVersion: string;
};

type ExpectedResolutionError = {
    readonly importPackageJson: SinonSpy;
    readonly expectedMessage: string;
};

function createResolver(overrides: FactoryOverrides = {}): {
    readonly resolve: () => Promise<string>;
    readonly importPackageJson: SinonSpy;
} {
    const importPackageJson =
        overrides.importPackageJson ??
        fake.rejects(Object.assign(new Error('missing'), { code: 'ERR_MODULE_NOT_FOUND' }));
    const resolve = createPacktoryToolVersionResolver({ importPackageJson });
    return { resolve, importPackageJson };
}

function createJsonImporter(
    specifier: string,
    packageJson: PackageJsonSpec | { readonly default: PackageJsonSpec }
): SinonSpy {
    return fake(async (candidateSpecifier: string) => {
        if (candidateSpecifier === specifier) {
            return packageJson;
        }
        throw Object.assign(new Error(`Cannot resolve ${candidateSpecifier}`), {
            code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
        });
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
            importPackageJson: fake(async (specifier: string) => {
                if (specifier === '@packtory/cli/package.json') {
                    throw Object.assign(new Error(`Cannot resolve ${specifier}`), {
                        code: 'ERR_MODULE_NOT_FOUND'
                    });
                }
                if (specifier === 'packtory/package.json') {
                    return { default: { name: 'packtory', version: '4.5.6' } };
                }
                throw new Error(`Unexpected specifier: ${specifier}`);
            }),
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

        assert.strictEqual(importPackageJson.callCount, 1);
        assert.deepStrictEqual(importPackageJson.firstCall.args, ['@packtory/cli/package.json']);
    });

    test('rethrows non-object import failures instead of treating them as resolution errors', async function () {
        const rejectPromise = Reflect.get(Promise, 'reject').bind(Promise) as (reason: unknown) => Promise<never>;
        const importPackageJson = fake(async () => await rejectPromise('boom'));
        const { resolve } = createResolver({ importPackageJson });

        try {
            await resolve();
            assert.fail('Expected resolve() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(error, 'boom');
        }

        assert.strictEqual(importPackageJson.callCount, 1);
        assert.deepStrictEqual(importPackageJson.firstCall.args, ['@packtory/cli/package.json']);
    });

    test('rethrows null import failures instead of treating them as resolution errors', async function () {
        const rejectPromise = Reflect.get(Promise, 'reject').bind(Promise) as (reason: unknown) => Promise<never>;
        const importPackageJson = fake(async () => await rejectPromise(null));
        const { resolve } = createResolver({ importPackageJson });

        try {
            await resolve();
            assert.fail('Expected resolve() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(error, null);
        }

        assert.strictEqual(importPackageJson.callCount, 1);
        assert.deepStrictEqual(importPackageJson.firstCall.args, ['@packtory/cli/package.json']);
    });

    test('throws when the imported package.json has an unexpected package name', async function () {
        await expectResolutionError({
            importPackageJson: createJsonImporter('packtory/package.json', {
                default: { name: 'not-packtory', version: '1.2.3' }
            }),
            expectedMessage: 'Imported packtory package.json from "packtory/package.json" has unexpected package name'
        });
    });

    test('throws when the imported package.json has no version field', async function () {
        await expectResolutionError({
            importPackageJson: fake(async (specifier: string) => {
                if (specifier === 'packtory/package.json') {
                    return { default: { name: 'packtory' } };
                }
                throw Object.assign(new Error(`Cannot resolve ${specifier}`), {
                    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
                });
            }),
            expectedMessage: 'Imported packtory package.json from "packtory/package.json" is missing a version field'
        });
    });

    test('throws when the imported package.json module shape is malformed', async function () {
        await expectResolutionError({
            importPackageJson: fake(async (specifier: string) => {
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
