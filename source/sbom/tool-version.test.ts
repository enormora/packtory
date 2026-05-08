import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { FileManager } from '../file-manager/file-manager.ts';
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
    readonly readFile?: SinonSpy;
};

function createFileManager(readFile: SinonSpy): FileManager {
    return {
        readFile,
        checkReadability: fake.resolves({ isReadable: true }),
        writeFile: fake(),
        copyFile: fake(),
        getTransferableFileDescriptionFromPath: fake()
    };
}

function createResolver(overrides: FactoryOverrides = {}): {
    readonly resolve: () => Promise<string>;
    readonly resolvePackagePath: SinonSpy;
    readonly readFile: SinonSpy;
} {
    const resolvePackagePath = overrides.resolvePackagePath ?? fake.returns(undefined);
    const readFile = overrides.readFile ?? fake.resolves('{}');
    const resolve = createPacktoryToolVersionResolver({
        fileManager: createFileManager(readFile),
        resolvePackagePath
    });
    return { resolve, resolvePackagePath, readFile };
}

test('returns the version from @packtory/cli when its package.json resolves inside node_modules', async () => {
    const resolvePackagePath = fake((specifier: string) => {
        return specifier === '@packtory/cli/package.json' ? '/repo/node_modules/@packtory/cli/package.json' : undefined;
    });
    const readFile = fake.resolves(JSON.stringify({ name: '@packtory/cli', version: '1.2.3' }));
    const { resolve } = createResolver({ resolvePackagePath, readFile });

    const result = await resolve();

    assert.strictEqual(result, '1.2.3');
    assert.deepStrictEqual(readFile.firstCall.args, ['/repo/node_modules/@packtory/cli/package.json']);
});

test('falls back to packtory when @packtory/cli is not resolvable', async () => {
    const resolvePackagePath = fake((specifier: string) => {
        return specifier === 'packtory/package.json' ? '/repo/node_modules/packtory/package.json' : undefined;
    });
    const readFile = fake.resolves(JSON.stringify({ name: 'packtory', version: '4.5.6' }));
    const { resolve } = createResolver({ resolvePackagePath, readFile });

    const result = await resolve();

    assert.strictEqual(result, '4.5.6');
});

test('throws when neither @packtory/cli nor packtory can be resolved', async () => {
    const { resolve } = createResolver({ resolvePackagePath: fake.returns(undefined) });

    try {
        await resolve();
        assert.fail('Expected resolve() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, unresolvableExpectedMessage);
    }
});

test('throws when the resolved package.json path is not inside a node_modules folder', async () => {
    const resolvePackagePath = fake.returns('/repo/source/sbom/package.json');
    const { resolve, readFile } = createResolver({ resolvePackagePath });

    try {
        await resolve();
        assert.fail('Expected resolve() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, outsideNodeModulesExpectedMessage);
        assert.strictEqual(readFile.callCount, 0);
    }
});

test('throws when the resolved package.json has no version field', async () => {
    const resolvePackagePath = fake.returns('/repo/node_modules/packtory/package.json');
    const readFile = fake.resolves(JSON.stringify({ name: 'packtory' }));
    const { resolve } = createResolver({ resolvePackagePath, readFile });

    try {
        await resolve();
        assert.fail('Expected resolve() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, missingVersionExpectedMessage);
    }
});
