import test from 'ava';
import fs from 'node:fs';
import { fake, SinonSpy } from 'sinon';
import { FileManagerDependencies, createFileManager, FileManager } from './file-manager.js';

interface Overrides {
    access?: SinonSpy;
    mkdir?: SinonSpy;
    writeFile?: SinonSpy;
    readFile?: SinonSpy;
}

function fileManagerFactory(overrides: Overrides = {}): FileManager {
    const { access = fake(), mkdir = fake(), writeFile = fake(), readFile = fake() } = overrides;
    const fakeDependencies = {
        hostFileSystem: { access, mkdir, writeFile, readFile },
    } as unknown as FileManagerDependencies;
    return createFileManager(fakeDependencies);
}

test('checkReadability() returns isReadable true when access() resolves', async (t) => {
    const access = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ access });

    const result = await fileManager.checkReadability('/foo/bar.txt');

    t.is(access.callCount, 1);
    t.deepEqual(access.firstCall.args, ['/foo/bar.txt', fs.constants.R_OK]);
    t.deepEqual(result, { isReadable: true });
});

test('checkReadability() returns isReadable false when access() rejects', async (t) => {
    const access = fake.rejects(undefined);
    const fileManager = fileManagerFactory({ access });

    const result = await fileManager.checkReadability('/foo/bar.txt');

    t.is(access.callCount, 1);
    t.deepEqual(access.firstCall.args, ['/foo/bar.txt', fs.constants.R_OK]);
    t.deepEqual(result, { isReadable: false });
});

test('writeFile() writes the given content to the given file when the parent folder exists', async (t) => {
    const access = fake.resolves(undefined);
    const writeFile = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ access, writeFile });

    await fileManager.writeFile('/foo/bar.txt', 'the-content');

    t.is(access.callCount, 1);
    t.deepEqual(access.firstCall.args, ['/foo', fs.constants.R_OK]);
    t.is(writeFile.callCount, 1);
    t.deepEqual(writeFile.firstCall.args, ['/foo/bar.txt', 'the-content', { encoding: 'utf8' }]);
});

test('writeFile() recursivly creates the parent folder and then writes the given content to the given file when the parent folder does not exist', async (t) => {
    const access = fake.rejects(undefined);
    const writeFile = fake.resolves(undefined);
    const mkdir = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ access, writeFile, mkdir });

    await fileManager.writeFile('/foo/bar.txt', 'the-content');

    t.is(access.callCount, 1);
    t.deepEqual(access.firstCall.args, ['/foo', fs.constants.R_OK]);
    t.is(mkdir.callCount, 1);
    t.deepEqual(mkdir.firstCall.args, ['/foo', { recursive: true }]);
    t.is(writeFile.callCount, 1);
    t.deepEqual(writeFile.firstCall.args, ['/foo/bar.txt', 'the-content', { encoding: 'utf8' }]);
});

test('readFile() reads the given file and returns its content', async (t) => {
    const readFile = fake.resolves('the-content');
    const fileManager = fileManagerFactory({ readFile });

    const result = await fileManager.readFile('/foo/bar.txt');

    t.is(readFile.callCount, 1);
    t.deepEqual(readFile.firstCall.args, ['/foo/bar.txt', { encoding: 'utf8' }]);
    t.is(result, 'the-content');
});

test('copyFile() reads the content of the first file and writes that to the second file', async (t) => {
    const readFile = fake.resolves('the-content');
    const writeFile = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ readFile, writeFile });

    await fileManager.copyFile('/foo/1.txt', '/foo/2.txt');

    t.is(readFile.callCount, 1);
    t.deepEqual(readFile.firstCall.args, ['/foo/1.txt', { encoding: 'utf8' }]);
    t.is(writeFile.callCount, 1);
    t.deepEqual(writeFile.firstCall.args, ['/foo/2.txt', 'the-content', { encoding: 'utf8' }]);
});
