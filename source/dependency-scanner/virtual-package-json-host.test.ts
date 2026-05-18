/* eslint-disable @typescript-eslint/consistent-type-assertions, node/no-sync -- test stubs cast partial mocks of complex orchestrator types and exercise the ts-morph synchronous file-system interface */
import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import type { FileSystemHost } from 'ts-morph';
import { createVirtualPackageJsonHost } from './virtual-package-json-host.ts';

function delegatingHost(records: Map<string, string>): FileSystemHost {
    return {
        fileExists: async (filePath: string) => records.has(filePath),
        fileExistsSync: (filePath: string) => records.has(filePath),
        readFile: async (filePath: string) => records.get(filePath) ?? '',
        readFileSync: (filePath: string) => records.get(filePath) ?? ''
    } as unknown as FileSystemHost;
}

const stubMainPackageJson = { name: 'pkg', version: '1.0.0', type: 'module' } as never;

suite('virtual-package-json-host', function () {
    test('createVirtualPackageJsonHost reports the virtual package.json as existing', async function () {
        const host = createVirtualPackageJsonHost(delegatingHost(new Map()), '/p', stubMainPackageJson);
        const packageJsonPath = path.resolve('/p', 'package.json');

        assert.strictEqual(host.fileExistsSync(packageJsonPath), true);
        assert.strictEqual(await host.fileExists(packageJsonPath), true);
    });

    test('createVirtualPackageJsonHost serves the serialized main package.json content', async function () {
        const host = createVirtualPackageJsonHost(delegatingHost(new Map()), '/p', stubMainPackageJson);
        const packageJsonPath = path.resolve('/p', 'package.json');

        assert.deepStrictEqual(JSON.parse(host.readFileSync(packageJsonPath)), stubMainPackageJson);
        assert.deepStrictEqual(JSON.parse(await host.readFile(packageJsonPath)), stubMainPackageJson);
    });

    test('createVirtualPackageJsonHost delegates unrelated file reads to the wrapped host', async function () {
        const records = new Map([['/other.txt', 'hello']]);
        const host = createVirtualPackageJsonHost(delegatingHost(records), '/p', stubMainPackageJson);

        assert.strictEqual(host.readFileSync('/other.txt'), 'hello');
        assert.strictEqual(await host.readFile('/other.txt'), 'hello');
    });

    test('createVirtualPackageJsonHost delegates fileExists calls for unrelated paths to the wrapped host', async function () {
        const records = new Map([['/other.txt', 'hello']]);
        const host = createVirtualPackageJsonHost(delegatingHost(records), '/p', stubMainPackageJson);

        assert.strictEqual(host.fileExistsSync('/other.txt'), true);
        assert.strictEqual(await host.fileExists('/other.txt'), true);
        assert.strictEqual(host.fileExistsSync('/missing.txt'), false);
    });
});
