import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { FileManager } from '../file-manager/file-manager.ts';
import { createLicenseResolver } from './license-resolver.ts';

type FileManagerOverrides = {
    readonly checkReadability?: SinonSpy;
    readonly readFile?: SinonSpy;
};

function createFileManager(overrides: FileManagerOverrides = {}): FileManager {
    return {
        checkReadability: overrides.checkReadability ?? fake.resolves({ isReadable: true }),
        readFile: overrides.readFile ?? fake.resolves('{}'),
        writeFile: fake(),
        copyFile: fake(),
        getTransferableFileDescriptionFromPath: fake()
    };
}

test('resolveLicense() returns the SPDX expression when the dependency’s package.json has a string license', async () => {
    const fileManager = createFileManager({
        readFile: fake.resolves(JSON.stringify({ license: 'MIT' }))
    });
    const resolver = createLicenseResolver({ fileManager });

    const result = await resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });

    assert.strictEqual(result, 'MIT');
});

test('resolveLicense() reads from the dependency’s package.json under node_modules', async () => {
    const readFile = fake.resolves(JSON.stringify({ license: 'MIT' }));
    const fileManager = createFileManager({ readFile });
    const resolver = createLicenseResolver({ fileManager });

    await resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });

    assert.strictEqual(readFile.callCount, 1);
    assert.deepStrictEqual(readFile.firstCall.args, ['/project/node_modules/lodash/package.json']);
});

test('resolveLicense() returns undefined when the dependency’s package.json does not declare a license', async () => {
    const fileManager = createFileManager({
        readFile: fake.resolves(JSON.stringify({}))
    });
    const resolver = createLicenseResolver({ fileManager });

    const result = await resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });

    assert.strictEqual(result, undefined);
});

test('resolveLicense() returns undefined when the license field is not a non-empty string', async () => {
    const fileManager = createFileManager({
        readFile: fake.resolves(JSON.stringify({ license: '' }))
    });
    const resolver = createLicenseResolver({ fileManager });

    const result = await resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });

    assert.strictEqual(result, undefined);
});

test('resolveLicense() returns undefined when the license field is an object', async () => {
    const fileManager = createFileManager({
        readFile: fake.resolves(JSON.stringify({ license: { type: 'MIT', url: 'https://example.test' } }))
    });
    const resolver = createLicenseResolver({ fileManager });

    const result = await resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });

    assert.strictEqual(result, undefined);
});

test('resolveLicense() preserves a free-text license string verbatim', async () => {
    const fileManager = createFileManager({
        readFile: fake.resolves(JSON.stringify({ license: 'See LICENSE.txt for details' }))
    });
    const resolver = createLicenseResolver({ fileManager });

    const result = await resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });

    assert.strictEqual(result, 'See LICENSE.txt for details');
});

test('resolveLicense() throws a descriptive error when the dependency is not installed', async () => {
    const fileManager = createFileManager({
        checkReadability: fake.resolves({ isReadable: false })
    });
    const resolver = createLicenseResolver({ fileManager });

    try {
        await resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });
        assert.fail('Expected resolveLicense() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Dependency "lodash" is declared in the published manifest but is not installed in node_modules'
        );
    }
});
