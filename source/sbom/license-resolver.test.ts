import assert from 'node:assert';
import { test } from 'mocha';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createLicenseResolver } from './license-resolver.ts';

async function expectResolvedLicense(packageJsonContent: string): Promise<string | undefined> {
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [{ value: packageJsonContent }]
    });
    const resolver = createLicenseResolver({ fileManager });

    return resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });
}

test('resolveLicense() returns the SPDX expression when the dependency’s package.json has a string license', async () => {
    const result = await expectResolvedLicense(JSON.stringify({ license: 'MIT' }));

    assert.strictEqual(result, 'MIT');
});

test('resolveLicense() reads from the dependency’s package.json under node_modules', async () => {
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [{ value: JSON.stringify({ license: 'MIT' }) }]
    });
    const resolver = createLicenseResolver({ fileManager });

    await resolver.resolveLicense({ projectFolder: '/project', dependencyName: 'lodash' });

    assert.strictEqual(fileManager.getReadFileCallCount(), 1);
    assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: '/project/node_modules/lodash/package.json' });
});

test('resolveLicense() returns undefined when the dependency’s package.json does not declare a license', async () => {
    const result = await expectResolvedLicense(JSON.stringify({}));

    assert.strictEqual(result, undefined);
});

test('resolveLicense() returns undefined when the license field is not a non-empty string', async () => {
    const result = await expectResolvedLicense(JSON.stringify({ license: '' }));

    assert.strictEqual(result, undefined);
});

test('resolveLicense() returns undefined when the license field is an object', async () => {
    const result = await expectResolvedLicense(
        JSON.stringify({ license: { type: 'MIT', url: 'https://example.test' } })
    );

    assert.strictEqual(result, undefined);
});

test('resolveLicense() preserves a free-text license string verbatim', async () => {
    const result = await expectResolvedLicense(JSON.stringify({ license: 'See LICENSE.txt for details' }));

    assert.strictEqual(result, 'See LICENSE.txt for details');
});

test('resolveLicense() throws a descriptive error when the dependency is not installed', async () => {
    const fileManager = createFakeFileManager({
        simulatedCheckReadabilityResponses: [{ value: { isReadable: false } }]
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
