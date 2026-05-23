/* eslint-disable node/no-sync -- exercises the ts-morph synchronous file-system interface */
import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { createDelegatingFileSystemHost } from '../test-libraries/delegating-file-system-host.ts';
import { createVirtualPackageJsonHost } from './virtual-package-json-host.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MainPackageJson is a complex branded type; tests only need a structurally-compatible literal
const stubMainPackageJson = { name: 'pkg', version: '1.0.0', type: 'module' } as never;

suite('virtual-package-json-host', function () {
    test('createVirtualPackageJsonHost reports the virtual package.json as existing', async function () {
        const host = createVirtualPackageJsonHost(createDelegatingFileSystemHost(new Map()), '/p', stubMainPackageJson);
        const packageJsonPath = path.resolve('/p', 'package.json');

        assert.strictEqual(host.fileExistsSync(packageJsonPath), true);
        assert.strictEqual(await host.fileExists(packageJsonPath), true);
    });

    test('createVirtualPackageJsonHost serves the serialized main package.json content', async function () {
        const host = createVirtualPackageJsonHost(createDelegatingFileSystemHost(new Map()), '/p', stubMainPackageJson);
        const packageJsonPath = path.resolve('/p', 'package.json');

        assert.deepStrictEqual(JSON.parse(host.readFileSync(packageJsonPath)), stubMainPackageJson);
        assert.deepStrictEqual(JSON.parse(await host.readFile(packageJsonPath)), stubMainPackageJson);
    });

    test('createVirtualPackageJsonHost delegates unrelated file reads to the wrapped host', async function () {
        const records = new Map([['/other.txt', 'hello']]);
        const host = createVirtualPackageJsonHost(createDelegatingFileSystemHost(records), '/p', stubMainPackageJson);

        assert.strictEqual(host.readFileSync('/other.txt'), 'hello');
        assert.strictEqual(await host.readFile('/other.txt'), 'hello');
    });

    test('createVirtualPackageJsonHost delegates fileExists calls for unrelated paths to the wrapped host', async function () {
        const records = new Map([['/other.txt', 'hello']]);
        const host = createVirtualPackageJsonHost(createDelegatingFileSystemHost(records), '/p', stubMainPackageJson);

        assert.strictEqual(host.fileExistsSync('/other.txt'), true);
        assert.strictEqual(await host.fileExists('/other.txt'), true);
        assert.strictEqual(host.fileExistsSync('/missing.txt'), false);
    });

    test('createVirtualPackageJsonHost throws when the wrapped readFileSync returns a non-string for delegated reads', function () {
        const misbehavingHost = {
            fileExists: async () => true,
            fileExistsSync: () => true,
            readFile: async () => '',
            readFileSync: () => true
        } as unknown as Parameters<typeof createVirtualPackageJsonHost>[0];
        const host = createVirtualPackageJsonHost(misbehavingHost, '/p', stubMainPackageJson);

        try {
            host.readFileSync('/other.txt');
            assert.fail('Expected readFileSync() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Expected readFileSync to return a string');
        }
    });
});
