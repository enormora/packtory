import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createPacktoryToolVersionResolver } from './tool-version.ts';

const unresolvableExpectedMessage =
    'Cannot determine packtory tool version: neither "@packtory/cli" nor "packtory" is resolvable.' +
    ' Install packtory via npm so it lives under node_modules/.';

const outsideNodeModulesExpectedMessage =
    'Refusing to read packtory tool version from "/repo/source/sbom/package.json":' +
    ' the resolved package.json is not inside a node_modules folder.' +
    ' Install packtory via npm to make its real version available.';

const missingVersionExpectedMessage =
    'Resolved packtory package.json at "/repo/node_modules/packtory/package.json" is missing a version field';

type FactoryOverrides = {
    readonly resolvePackagePath?: SinonSpy;
    readonly fileManager?: FakeFileManager;
    readonly fallbackPackageJsonPath?: string;
};

type PackageJsonSpec = {
    readonly name: string;
    readonly version: string;
};

type ExpectedResolution = {
    readonly resolvePackagePath: SinonSpy;
    readonly packageJson: PackageJsonSpec;
    readonly expectedVersion: string;
    readonly expectedReadFilePath?: string;
    readonly fallbackPackageJsonPath?: string;
};

type ExpectedResolutionError = {
    readonly resolvePackagePath: SinonSpy;
    readonly expectedMessage: string;
    readonly fallbackPackageJsonPath?: string;
    readonly packageJson?: PackageJsonSpec;
};

function createResolver(overrides: FactoryOverrides = {}): {
    readonly resolve: () => Promise<string>;
    readonly resolvePackagePath: SinonSpy;
    readonly fileManager: FakeFileManager;
} {
    const resolvePackagePath = overrides.resolvePackagePath ?? fake.returns(undefined);
    const fileManager =
        overrides.fileManager ?? createFakeFileManager({ simulatedReadFileResponses: [{ value: '{}' }] });
    const resolve = createPacktoryToolVersionResolver({
        fileManager,
        resolvePackagePath,
        ...(overrides.fallbackPackageJsonPath === undefined
            ? {}
            : { fallbackPackageJsonPath: overrides.fallbackPackageJsonPath })
    });
    return { resolve, resolvePackagePath, fileManager };
}

function createPackageJsonFileManager(packageJson: PackageJsonSpec): FakeFileManager {
    return createFakeFileManager({
        simulatedReadFileResponses: [{ value: JSON.stringify(packageJson) }]
    });
}

function createSingleResolution(specifier: string, resolvedPath: string): SinonSpy {
    return fake((candidateSpecifier: string) => {
        return candidateSpecifier === specifier ? resolvedPath : undefined;
    });
}

async function expectResolvedVersion(expectedResolution: ExpectedResolution): Promise<void> {
    const { resolvePackagePath, packageJson, expectedVersion, expectedReadFilePath, fallbackPackageJsonPath } =
        expectedResolution;
    const fileManager = createPackageJsonFileManager(packageJson);
    const { resolve } = createResolver({
        resolvePackagePath,
        fileManager,
        ...(fallbackPackageJsonPath === undefined ? {} : { fallbackPackageJsonPath })
    });

    const result = await resolve();

    assert.strictEqual(result, expectedVersion);
    if (expectedReadFilePath !== undefined) {
        assert.deepStrictEqual(fileManager.getReadFileCall(0), {
            filePath: expectedReadFilePath
        });
    }
}

async function expectResolutionError(expectedResolutionError: ExpectedResolutionError): Promise<void> {
    const { resolvePackagePath, expectedMessage, fallbackPackageJsonPath, packageJson } = expectedResolutionError;
    const fileManager =
        packageJson === undefined
            ? createFakeFileManager({ simulatedReadFileResponses: [{ value: '{}' }] })
            : createPackageJsonFileManager(packageJson);
    const { resolve } = createResolver({
        resolvePackagePath,
        fileManager,
        ...(fallbackPackageJsonPath === undefined ? {} : { fallbackPackageJsonPath })
    });

    try {
        await resolve();
        assert.fail('Expected resolve() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

test('returns the version from @packtory/cli when its package.json resolves inside node_modules', async () => {
    await expectResolvedVersion({
        resolvePackagePath: createSingleResolution(
            '@packtory/cli/package.json',
            '/repo/node_modules/@packtory/cli/package.json'
        ),
        packageJson: { name: '@packtory/cli', version: '1.2.3' },
        expectedVersion: '1.2.3',
        expectedReadFilePath: '/repo/node_modules/@packtory/cli/package.json'
    });
});

test('derives the package.json path from the package entrypoint when package exports hide package.json', async () => {
    await expectResolvedVersion({
        resolvePackagePath: createSingleResolution(
            '@packtory/cli',
            '/repo/node_modules/@packtory/cli/packages/command-line-interface/command-line-interface.entry-point.js'
        ),
        packageJson: { name: '@packtory/cli', version: '1.2.3' },
        expectedVersion: '1.2.3',
        expectedReadFilePath: '/repo/node_modules/@packtory/cli/package.json'
    });
});

test('derives a scoped package.json path from deeply nested entrypoint folders', async () => {
    await expectResolvedVersion({
        resolvePackagePath: createSingleResolution(
            '@packtory/cli',
            '/repo/node_modules/@packtory/cli/dist/packages/command-line-interface/command-line-interface.entry-point.js'
        ),
        packageJson: { name: '@packtory/cli', version: '1.2.3' },
        expectedVersion: '1.2.3',
        expectedReadFilePath: '/repo/node_modules/@packtory/cli/package.json'
    });
});

test('falls back to packtory when @packtory/cli is not resolvable', async () => {
    await expectResolvedVersion({
        resolvePackagePath: createSingleResolution('packtory/package.json', '/repo/node_modules/packtory/package.json'),
        packageJson: { name: 'packtory', version: '4.5.6' },
        expectedVersion: '4.5.6'
    });
});

test('derives an unscoped package.json path from the package entrypoint when needed', async () => {
    await expectResolvedVersion({
        resolvePackagePath: createSingleResolution(
            'packtory',
            '/repo/node_modules/packtory/packages/packtory/packtory.entry-point.js'
        ),
        packageJson: { name: 'packtory', version: '4.5.6' },
        expectedVersion: '4.5.6',
        expectedReadFilePath: '/repo/node_modules/packtory/package.json'
    });
});

test('throws when neither @packtory/cli nor packtory can be resolved', async () => {
    await expectResolutionError({
        resolvePackagePath: fake.returns(undefined),
        expectedMessage: unresolvableExpectedMessage
    });
});

test('falls back to an explicitly configured workspace package.json when npm installation resolution is unavailable', async () => {
    await expectResolvedVersion({
        resolvePackagePath: fake.returns(undefined),
        packageJson: { name: 'packtory', version: '0.0.0-dev' },
        expectedVersion: '0.0.0-dev',
        expectedReadFilePath: '/repo/package.json',
        fallbackPackageJsonPath: '/repo/package.json'
    });
});

test('throws when the resolved package.json path is not inside a node_modules folder', async () => {
    const resolvePackagePath = fake.returns('/repo/source/sbom/package.json');
    const { resolve, fileManager } = createResolver({ resolvePackagePath });

    try {
        await resolve();
        assert.fail('Expected resolve() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, outsideNodeModulesExpectedMessage);
        assert.strictEqual(fileManager.getReadFileCallCount(), 0);
    }
});

test('throws when resolving a package entrypoint never reaches a node_modules package root', async () => {
    await expectResolutionError({
        resolvePackagePath: createSingleResolution('packtory', '/packtory.entry-point.js'),
        expectedMessage:
            'Refusing to read packtory tool version from "/package.json": the resolved package.json is not inside a node_modules folder. Install packtory via npm to make its real version available.'
    });
});

test('does not mistake scoped-looking directories outside node_modules for installed packages', async () => {
    await expectResolutionError({
        resolvePackagePath: createSingleResolution(
            'packtory',
            '/repo/@packtory/cli/command-line-interface.entry-point.js'
        ),
        expectedMessage:
            'Refusing to read packtory tool version from "/package.json": the resolved package.json is not inside a node_modules folder. Install packtory via npm to make its real version available.'
    });
});

test('throws when the fallback package.json has an unexpected package name', async () => {
    await expectResolutionError({
        resolvePackagePath: fake.returns(undefined),
        packageJson: { name: 'not-packtory', version: '1.2.3' },
        fallbackPackageJsonPath: '/repo/package.json',
        expectedMessage: 'Resolved packtory package.json at "/repo/package.json" has unexpected package name'
    });
});

test('throws when the resolved package.json has no version field', async () => {
    const resolvePackagePath = fake.returns('/repo/node_modules/packtory/package.json');
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [{ value: JSON.stringify({ name: 'packtory' }) }]
    });
    const { resolve } = createResolver({ resolvePackagePath, fileManager });

    try {
        await resolve();
        assert.fail('Expected resolve() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, missingVersionExpectedMessage);
    }
});
