import fs from 'node:fs';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { type FileManagerDependencies, createFileManager, type FileManager } from './file-manager.ts';

type Overrides = {
    readonly access?: SinonSpy;
    readonly mkdir?: SinonSpy;
    readonly writeFile?: SinonSpy;
    readonly readFile?: SinonSpy;
    readonly stat?: SinonSpy;
    readonly chmod?: SinonSpy;
    readonly copyFile?: SinonSpy;
    readonly readdir?: SinonSpy;
    readonly realpath?: SinonSpy;
};

function fileManagerFactory(overrides: Overrides = {}): FileManager {
    const fallbackHostFileSystem = {
        ...fs.promises,
        access: fake(),
        mkdir: fake(),
        writeFile: fake(),
        readFile: fake(),
        stat: fake(),
        chmod: fake(),
        copyFile: fake(),
        readdir: fake(),
        realpath: fake()
    };
    const hostFileSystem: FileManagerDependencies['hostFileSystem'] = {
        ...fallbackHostFileSystem,
        ...overrides
    };
    const dependencies: FileManagerDependencies = { hostFileSystem };

    return createFileManager(dependencies);
}

async function expectCheckReadability(access: SinonSpy, expectedReadable: boolean): Promise<void> {
    const fileManager = fileManagerFactory({ access });

    const result = await fileManager.checkReadability('/foo/bar.txt');

    assertDeepSubset(access, {
        callCount: 1,
        firstCall: {
            args: [ '/foo/bar.txt', fs.constants.R_OK ]
        }
    });
    assert.deepStrictEqual(result, { isReadable: expectedReadable });
}

suite('file-manager', function () {
    suite('readability', function () {
        test('checkReadability() returns isReadable true when access() resolves', async function () {
            await expectCheckReadability(fake.resolves(undefined), true);
        });

        test('checkReadability() returns isReadable false when access() rejects', async function () {
            await expectCheckReadability(fake.rejects(undefined), false);
        });
    });

    suite('text writes', function () {
        test('writeFile() writes the given content to the given file when the parent folder exists', async function () {
            const access = fake.resolves(undefined);
            const writeFile = fake.resolves(undefined);
            const fileManager = fileManagerFactory({ access, writeFile });

            await fileManager.writeFile('/foo/bar.txt', 'the-content');

            assertDeepSubset(access, {
                callCount: 1,
                firstCall: {
                    args: [ '/foo', fs.constants.R_OK ]
                }
            });
            assertDeepSubset(writeFile, {
                callCount: 1,
                firstCall: {
                    args: [ '/foo/bar.txt', 'the-content', { encoding: 'utf8' } ]
                }
            });
        });

        async function runWriteFile(
            access: SinonSpy
        ): Promise<{ readonly writeFile: SinonSpy; readonly mkdir: SinonSpy; }> {
            const writeFile = fake.resolves(undefined);
            const mkdir = fake.resolves(undefined);
            const fileManager = fileManagerFactory({ access, writeFile, mkdir });

            await fileManager.writeFile('/foo/bar.txt', 'the-content');
            return { writeFile, mkdir };
        }

        test('writeFile() recursively creates the parent folder and then writes the given content to the given file when the parent folder does not exist', async function () {
            const access = fake.rejects(undefined);
            const { writeFile, mkdir } = await runWriteFile(access);

            assert.deepStrictEqual(access.args, [ [ '/foo', fs.constants.R_OK ] ]);
            assert.deepStrictEqual(mkdir.args, [ [ '/foo', { recursive: true } ] ]);
            assert.deepStrictEqual(writeFile.args, [ [ '/foo/bar.txt', 'the-content', { encoding: 'utf8' } ] ]);
        });

        test('writeFile() does not create the parent folder when it is already readable', async function () {
            const { writeFile, mkdir } = await runWriteFile(fake.resolves(undefined));

            assert.strictEqual(mkdir.callCount, 0);
            assert.deepStrictEqual(writeFile.args, [ [ '/foo/bar.txt', 'the-content', { encoding: 'utf8' } ] ]);
        });
    });

    suite('binary writes', function () {
        async function runWriteBinaryFile(
            access: SinonSpy
        ): Promise<{ readonly writeFile: SinonSpy; readonly mkdir: SinonSpy; readonly payload: Buffer; }> {
            const writeFile = fake.resolves(undefined);
            const mkdir = fake.resolves(undefined);
            const fileManager = fileManagerFactory({ access, writeFile, mkdir });
            const payload = Buffer.from([ 7, 8, 9 ]);
            await fileManager.writeBinaryFile('/dist/archive.zip', payload);
            return { writeFile, mkdir, payload };
        }

        test('writeBinaryFile() writes the binary payload without applying utf-8 encoding when the parent folder is already readable', async function () {
            const access = fake.resolves(undefined);
            const { writeFile, mkdir, payload } = await runWriteBinaryFile(access);

            assert.strictEqual(mkdir.callCount, 0);
            assert.deepStrictEqual(access.args, [ [ '/dist', fs.constants.R_OK ] ]);
            assert.deepStrictEqual(writeFile.args, [ [ '/dist/archive.zip', payload ] ]);
        });

        test('writeBinaryFile() recursively creates the parent folder before writing when the folder is missing', async function () {
            const { writeFile, mkdir, payload } = await runWriteBinaryFile(fake.rejects(undefined));

            assert.deepStrictEqual(mkdir.args, [ [ '/dist', { recursive: true } ] ]);
            assert.deepStrictEqual(writeFile.args, [ [ '/dist/archive.zip', payload ] ]);
        });
    });

    suite('binary reads and copies', function () {
        test('readFileBytes() reads the given file as a Buffer without applying utf-8 decoding', async function () {
            const expected = Buffer.from([ 222, 173, 190, 239 ]);
            const readFile = fake.resolves(expected);
            const fileManager = fileManagerFactory({ readFile });

            const result = await fileManager.readFileBytes('/foo/native.node');

            assertDeepSubset(readFile, {
                callCount: 1,
                firstCall: {
                    args: [ '/foo/native.node' ]
                }
            });
            assert.strictEqual(result, expected);
        });

        test('copyFileBytes() copies the source file to the target via the host fs.copyFile primitive', async function () {
            const access = fake.resolves(undefined);
            const copyFile = fake.resolves(undefined);
            const fileManager = fileManagerFactory({ access, copyFile });

            await fileManager.copyFileBytes('/src/lib.node', '/dest/lib.node');

            assertDeepSubset(access, {
                callCount: 1,
                firstCall: {
                    args: [ '/dest', fs.constants.R_OK ]
                }
            });
            assert.deepStrictEqual(copyFile.args, [ [ '/src/lib.node', '/dest/lib.node' ] ]);
        });

        test('copyFileBytes() creates the destination folder when it does not exist before copying', async function () {
            const access = fake.rejects(undefined);
            const copyFile = fake.resolves(undefined);
            const mkdir = fake.resolves(undefined);
            const fileManager = fileManagerFactory({ access, copyFile, mkdir });

            await fileManager.copyFileBytes('/src/data.bin', '/out/extracted/data.bin');

            assert.deepStrictEqual(mkdir.args, [ [ '/out/extracted', { recursive: true } ] ]);
            assert.deepStrictEqual(copyFile.args, [ [ '/src/data.bin', '/out/extracted/data.bin' ] ]);
        });
    });

    suite('directories and real paths', function () {
        test('listDirectoryEntries() returns the entries from host readdir tagged with type information', async function () {
            const readdir = fake.resolves([
                {
                    name: 'file.txt',
                    isDirectory() {
                        return false;
                    },
                    isSymbolicLink() {
                        return false;
                    }
                },
                {
                    name: 'sub',
                    isDirectory() {
                        return true;
                    },
                    isSymbolicLink() {
                        return false;
                    }
                },
                {
                    name: 'linked',
                    isDirectory() {
                        return false;
                    },
                    isSymbolicLink() {
                        return true;
                    }
                }
            ]);
            const fileManager = fileManagerFactory({ readdir });

            const result = await fileManager.listDirectoryEntries('/some/folder');

            assert.deepStrictEqual(readdir.firstCall.args, [ '/some/folder', { withFileTypes: true } ]);
            assert.deepStrictEqual(result, [
                { name: 'file.txt', isDirectory: false, isSymbolicLink: false },
                { name: 'sub', isDirectory: true, isSymbolicLink: false },
                { name: 'linked', isDirectory: false, isSymbolicLink: true }
            ]);
        });

        test('getRealPath() delegates to host realpath', async function () {
            const realpath = fake.resolves('/real/path/somewhere');
            const fileManager = fileManagerFactory({ realpath });

            const result = await fileManager.getRealPath('/symlinked/path');

            assert.deepStrictEqual(realpath.firstCall.args, [ '/symlinked/path' ]);
            assert.strictEqual(result, '/real/path/somewhere');
        });
    });

    suite('text reads and metadata', function () {
        test('readFile() reads the given file and returns its content', async function () {
            const readFile = fake.resolves('the-content');
            const fileManager = fileManagerFactory({ readFile });

            const result = await fileManager.readFile('/foo/bar.txt');

            assertDeepSubset(readFile, {
                callCount: 1,
                firstCall: {
                    args: [ '/foo/bar.txt', { encoding: 'utf8' } ]
                }
            });
            assert.strictEqual(result, 'the-content');
        });

        test('copyFile() reads the content of the first file and writes that to the second file', async function () {
            const readFile = fake.resolves('the-content');
            const writeFile = fake.resolves(undefined);
            const fileManager = fileManagerFactory({ readFile, writeFile });

            await fileManager.copyFile('/foo/1.txt', '/foo/2.txt');

            assertDeepSubset(readFile, {
                callCount: 1,
                firstCall: {
                    args: [ '/foo/1.txt', { encoding: 'utf8' } ]
                }
            });
            assertDeepSubset(writeFile, {
                callCount: 1,
                firstCall: {
                    args: [ '/foo/2.txt', 'the-content', { encoding: 'utf8' } ]
                }
            });
        });

        test('setExecutable() writes the executable file mode when enabled', async function () {
            const chmod = fake.resolves(undefined);
            const fileManager = fileManagerFactory({ chmod });

            await fileManager.setExecutable('/foo/bar.txt', true);

            assert.deepStrictEqual(chmod.firstCall.args, [ '/foo/bar.txt', 0o755 ]);
        });

        test('setExecutable() writes the regular file mode when disabled', async function () {
            const chmod = fake.resolves(undefined);
            const fileManager = fileManagerFactory({ chmod });

            await fileManager.setExecutable('/foo/bar.txt', false);

            assert.deepStrictEqual(chmod.firstCall.args, [ '/foo/bar.txt', 0o644 ]);
        });

        test('getTransferableFileDescriptionFromPath() returns the file description of the given file paths', async function () {
            const stat = fake.resolves({ mode: 42 });
            const readFile = fake.resolves('the-content');
            const fileManager = fileManagerFactory({ stat, readFile });

            const result = await fileManager.getTransferableFileDescriptionFromPath('/foo/bar.txt', '/target/path.txt');

            assertDeepSubset(stat, {
                callCount: 1,
                firstCall: {
                    args: [ '/foo/bar.txt' ]
                }
            });
            assertDeepSubset(readFile, {
                callCount: 1,
                firstCall: {
                    args: [ '/foo/bar.txt', { encoding: 'utf8' } ]
                }
            });
            assert.deepStrictEqual(result, {
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: '/target/path.txt',
                content: 'the-content',
                isExecutable: false
            });
        });

        test('getTransferableFileDescriptionFromPath() returns the file description with isExecutable set to true when the file mode indicates this', async function () {
            const stat = fake.resolves({ mode: 493 });
            const readFile = fake.resolves('the-content');
            const fileManager = fileManagerFactory({ stat, readFile });

            const result = await fileManager.getTransferableFileDescriptionFromPath('/foo/bar.txt', '/target/path.txt');

            assert.deepStrictEqual(result, {
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: '/target/path.txt',
                content: 'the-content',
                isExecutable: true
            });
        });
    });
});
