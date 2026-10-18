/* eslint-disable node/no-sync -- exercises the ts-morph synchronous file-system interface */
import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import type { FileSystemHost } from 'ts-morph';
import type { MainPackageManifest } from '../configuration/package-manifest.ts';
import { createDelegatingFileSystemHost } from '../test-libraries/delegating-file-system-host.ts';
import { createVirtualPackageManifestHost } from './virtual-package-manifest-host.ts';

const stubMainPackageManifest: MainPackageManifest = { type: 'module' };

suite('virtual-package-json-host', function () {
    test('createVirtualPackageManifestHost reports the virtual package.json as existing', async function () {
        const host = createVirtualPackageManifestHost(
            createDelegatingFileSystemHost(new Map()),
            '/p',
            stubMainPackageManifest
        );
        const packageManifestPath = path.resolve('/p', 'package.json');

        assert.strictEqual(host.fileExistsSync(packageManifestPath), true);
        assert.strictEqual(await host.fileExists(packageManifestPath), true);
    });

    test('createVirtualPackageManifestHost serves the serialized main package.json content', async function () {
        const host = createVirtualPackageManifestHost(
            createDelegatingFileSystemHost(new Map()),
            '/p',
            stubMainPackageManifest
        );
        const packageManifestPath = path.resolve('/p', 'package.json');

        assert.deepStrictEqual(JSON.parse(host.readFileSync(packageManifestPath, 'utf8')), stubMainPackageManifest);
        assert.deepStrictEqual(JSON.parse(await host.readFile(packageManifestPath, 'utf8')), stubMainPackageManifest);
    });

    test('createVirtualPackageManifestHost delegates unrelated file reads to the wrapped host', async function () {
        const records = new Map([ [ '/other.txt', 'hello' ] ]);
        const host = createVirtualPackageManifestHost(
            createDelegatingFileSystemHost(records),
            '/p',
            stubMainPackageManifest
        );

        assert.strictEqual(host.readFileSync('/other.txt'), 'hello');
        assert.strictEqual(await host.readFile('/other.txt'), 'hello');
    });

    test('createVirtualPackageManifestHost delegates fileExists calls for unrelated paths to the wrapped host', async function () {
        const records = new Map([ [ '/other.txt', 'hello' ] ]);
        const host = createVirtualPackageManifestHost(
            createDelegatingFileSystemHost(records),
            '/p',
            stubMainPackageManifest
        );

        assert.strictEqual(host.fileExistsSync('/other.txt'), true);
        assert.strictEqual(await host.fileExists('/other.txt'), true);
        assert.strictEqual(host.fileExistsSync('/missing.txt'), false);
    });

    test('createVirtualPackageManifestHost throws when the wrapped readFileSync returns a non-string for delegated reads', function () {
        const misbehavingHost = {
            async fileExists() {
                return true;
            },
            fileExistsSync() {
                return true;
            },
            async readFile() {
                return '';
            },
            readFileSync() {
                return true;
            }
        } as unknown as FileSystemHost;
        const host = createVirtualPackageManifestHost(misbehavingHost, '/p', stubMainPackageManifest);

        try {
            host.readFileSync('/other.txt');
            assert.fail('Expected readFileSync() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Expected readFileSync to return a string');
        }
    });
});
