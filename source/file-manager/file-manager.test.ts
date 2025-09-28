import fs from 'node:fs';
import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import { type FileManagerDependencies, createFileManager, type FileManager } from './file-manager.ts';

type Overrides = {
    readonly access?: SinonSpy;
    readonly mkdir?: SinonSpy;
    readonly writeFile?: SinonSpy;
    readonly readFile?: SinonSpy;
    readonly stat?: SinonSpy;
};

// eslint-disable-next-line complexity -- needs to be refactored
function fileManagerFactory(overrides: Overrides = {}): FileManager {
    const { access = fake(), mkdir = fake(), writeFile = fake(), readFile = fake(), stat = fake() } = overrides;
    const fakeDependencies = {
        hostFileSystem: { access, mkdir, writeFile, readFile, stat }
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

test('writeFile() recursively creates the parent folder and then writes the given content to the given file when the parent folder does not exist', async (t) => {
    const access = fake.rejects(undefined);
    const writeFile = fake.resolves(undefined);
    const mkdir = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ access, writeFile, mkdir });

    await fileManager.writeFile('/foo/bar.txt', 'the-content');

    t.deepEqual(access.args, [['/foo', fs.constants.R_OK]]);
    t.deepEqual(mkdir.args, [['/foo', { recursive: true }]]);
    t.deepEqual(writeFile.args, [['/foo/bar.txt', 'the-content', { encoding: 'utf8' }]]);
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

test('getFileMode() returns the file mode of the given file path', async (t) => {
    const stat = fake.resolves({ mode: 42 });
    const fileManager = fileManagerFactory({ stat });

    const result = await fileManager.getFileMode('/foo/bar.txt');

    t.is(stat.callCount, 1);
    t.deepEqual(stat.firstCall.args, ['/foo/bar.txt']);
    t.is(result, 42);
});

test('getTransferableFileDescriptionFromPath() returns the file description of the given file paths', async (t) => {
    const stat = fake.resolves({ mode: 42 });
    const readFile = fake.resolves('the-content');
    const fileManager = fileManagerFactory({ stat, readFile });

    const result = await fileManager.getTransferableFileDescriptionFromPath('/foo/bar.txt', '/target/path.txt');

    t.is(stat.callCount, 1);
    t.deepEqual(stat.firstCall.args, ['/foo/bar.txt']);
    t.is(readFile.callCount, 1);
    t.deepEqual(readFile.firstCall.args, ['/foo/bar.txt', { encoding: 'utf8' }]);
    t.deepEqual(result, {
        sourceFilePath: '/foo/bar.txt',
        targetFilePath: '/target/path.txt',
        content: 'the-content',
        isExecutable: false
    });
});

test('getTransferableFileDescriptionFromPath() returns the file description with isExecutable set to true when the file mode indicates this', async (t) => {
    const stat = fake.resolves({ mode: 493 });
    const readFile = fake.resolves('the-content');
    const fileManager = fileManagerFactory({ stat, readFile });

    const result = await fileManager.getTransferableFileDescriptionFromPath('/foo/bar.txt', '/target/path.txt');

    t.deepEqual(result, {
        sourceFilePath: '/foo/bar.txt',
        targetFilePath: '/target/path.txt',
        content: 'the-content',
        isExecutable: true
    });
});
