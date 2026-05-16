import fs from 'node:fs';
import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { type FileManagerDependencies, createFileManager, type FileManager } from './file-manager.ts';

type Overrides = {
    readonly access?: SinonSpy;
    readonly mkdir?: SinonSpy;
    readonly writeFile?: SinonSpy;
    readonly readFile?: SinonSpy;
    readonly stat?: SinonSpy;
    readonly chmod?: SinonSpy;
};

function createSpy<TSpy extends SinonSpy>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

function fileManagerFactory(overrides: Overrides = {}): FileManager {
    const hostFileSystem: FileManagerDependencies['hostFileSystem'] = {
        ...fs.promises,
        access: createSpy(overrides.access, fake),
        mkdir: createSpy(overrides.mkdir, fake),
        writeFile: createSpy(overrides.writeFile, fake),
        readFile: createSpy(overrides.readFile, fake),
        stat: createSpy(overrides.stat, fake),
        chmod: createSpy(overrides.chmod, fake)
    };
    const dependencies: FileManagerDependencies = { hostFileSystem };

    return createFileManager(dependencies);
}

async function expectCheckReadability(access: SinonSpy, expectedReadable: boolean): Promise<void> {
    const fileManager = fileManagerFactory({ access });

    const result = await fileManager.checkReadability('/foo/bar.txt');

    assert.strictEqual(access.callCount, 1);
    assert.deepStrictEqual(access.firstCall.args, ['/foo/bar.txt', fs.constants.R_OK]);
    assert.deepStrictEqual(result, { isReadable: expectedReadable });
}

test('checkReadability() returns isReadable true when access() resolves', async () => {
    await expectCheckReadability(fake.resolves(undefined), true);
});

test('checkReadability() returns isReadable false when access() rejects', async () => {
    await expectCheckReadability(fake.rejects(undefined), false);
});

test('writeFile() writes the given content to the given file when the parent folder exists', async () => {
    const access = fake.resolves(undefined);
    const writeFile = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ access, writeFile });

    await fileManager.writeFile('/foo/bar.txt', 'the-content');

    assert.strictEqual(access.callCount, 1);
    assert.deepStrictEqual(access.firstCall.args, ['/foo', fs.constants.R_OK]);
    assert.strictEqual(writeFile.callCount, 1);
    assert.deepStrictEqual(writeFile.firstCall.args, ['/foo/bar.txt', 'the-content', { encoding: 'utf8' }]);
});

async function runWriteFile(access: SinonSpy): Promise<{ readonly writeFile: SinonSpy; readonly mkdir: SinonSpy }> {
    const writeFile = fake.resolves(undefined);
    const mkdir = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ access, writeFile, mkdir });

    await fileManager.writeFile('/foo/bar.txt', 'the-content');
    return { writeFile, mkdir };
}

test('writeFile() recursively creates the parent folder and then writes the given content to the given file when the parent folder does not exist', async () => {
    const access = fake.rejects(undefined);
    const { writeFile, mkdir } = await runWriteFile(access);

    assert.deepStrictEqual(access.args, [['/foo', fs.constants.R_OK]]);
    assert.deepStrictEqual(mkdir.args, [['/foo', { recursive: true }]]);
    assert.deepStrictEqual(writeFile.args, [['/foo/bar.txt', 'the-content', { encoding: 'utf8' }]]);
});

test('writeFile() does not create the parent folder when it is already readable', async () => {
    const { writeFile, mkdir } = await runWriteFile(fake.resolves(undefined));

    assert.strictEqual(mkdir.callCount, 0);
    assert.deepStrictEqual(writeFile.args, [['/foo/bar.txt', 'the-content', { encoding: 'utf8' }]]);
});

test('readFile() reads the given file and returns its content', async () => {
    const readFile = fake.resolves('the-content');
    const fileManager = fileManagerFactory({ readFile });

    const result = await fileManager.readFile('/foo/bar.txt');

    assert.strictEqual(readFile.callCount, 1);
    assert.deepStrictEqual(readFile.firstCall.args, ['/foo/bar.txt', { encoding: 'utf8' }]);
    assert.strictEqual(result, 'the-content');
});

test('copyFile() reads the content of the first file and writes that to the second file', async () => {
    const readFile = fake.resolves('the-content');
    const writeFile = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ readFile, writeFile });

    await fileManager.copyFile('/foo/1.txt', '/foo/2.txt');

    assert.strictEqual(readFile.callCount, 1);
    assert.deepStrictEqual(readFile.firstCall.args, ['/foo/1.txt', { encoding: 'utf8' }]);
    assert.strictEqual(writeFile.callCount, 1);
    assert.deepStrictEqual(writeFile.firstCall.args, ['/foo/2.txt', 'the-content', { encoding: 'utf8' }]);
});

test('setExecutable() writes the executable file mode when enabled', async () => {
    const chmod = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ chmod });

    await fileManager.setExecutable('/foo/bar.txt', true);

    assert.deepStrictEqual(chmod.firstCall.args, ['/foo/bar.txt', 0o755]);
});

test('setExecutable() writes the regular file mode when disabled', async () => {
    const chmod = fake.resolves(undefined);
    const fileManager = fileManagerFactory({ chmod });

    await fileManager.setExecutable('/foo/bar.txt', false);

    assert.deepStrictEqual(chmod.firstCall.args, ['/foo/bar.txt', 0o644]);
});

test('getTransferableFileDescriptionFromPath() returns the file description of the given file paths', async () => {
    const stat = fake.resolves({ mode: 42 });
    const readFile = fake.resolves('the-content');
    const fileManager = fileManagerFactory({ stat, readFile });

    const result = await fileManager.getTransferableFileDescriptionFromPath('/foo/bar.txt', '/target/path.txt');

    assert.strictEqual(stat.callCount, 1);
    assert.deepStrictEqual(stat.firstCall.args, ['/foo/bar.txt']);
    assert.strictEqual(readFile.callCount, 1);
    assert.deepStrictEqual(readFile.firstCall.args, ['/foo/bar.txt', { encoding: 'utf8' }]);
    assert.deepStrictEqual(result, {
        sourceFilePath: '/foo/bar.txt',
        targetFilePath: '/target/path.txt',
        content: 'the-content',
        isExecutable: false
    });
});

test('getTransferableFileDescriptionFromPath() returns the file description with isExecutable set to true when the file mode indicates this', async () => {
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
