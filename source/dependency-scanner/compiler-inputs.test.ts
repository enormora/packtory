import assert from 'node:assert';
import fileSystem from 'node:fs/promises';
import path from 'node:path';
import { suite, test } from 'mocha';
import { InMemoryFileSystemHost, type FileSystemHost } from 'ts-morph';
import { withCompilerWorkspace, type CompilerWorkspace } from '../test-libraries/compiler-workspace.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    compilerInputsAreCurrent,
    compilerInputsSchema,
    observeCompilerInputs,
    type CompilerInputs,
    type CompilerInputObservation
} from './compiler-inputs.ts';

function invoke(host: FileSystemHost, method: string, parameters: readonly unknown[]): unknown {
    const member: unknown = Reflect.get(host, method);
    if (typeof member !== 'function') {
        throw new TypeError('Expected a host method');
    }
    return Reflect.apply(member, host, parameters);
}

function observeDirectory(workspace: CompilerWorkspace, folder: string): CompilerInputs {
    const observed = observeCompilerInputs(workspace.fileSystemHost);
    invoke(observed.fileSystemHost, 'readDirSync', [ folder ]);
    const snapshot = observed.snapshot() ?? undefined;
    assertDefined(snapshot);
    assert.strictEqual(compilerInputsSchema.safeParse(snapshot).success, true);
    return snapshot;
}

type SourceObservation = {
    readonly file: string;
    readonly observed: CompilerInputObservation;
};

async function observeSource(workspace: CompilerWorkspace): Promise<SourceObservation> {
    const file = await workspace.write('source.js', 'first');
    const observed = observeCompilerInputs(workspace.fileSystemHost);
    invoke(observed.fileSystemHost, 'readFileSync', [ file ]);
    return { file, observed };
}

suite('compiler input freshness', function () {
    suite('unsupported metadata and symlink changes', function () {
        test('rejects previously readable inputs after a filesystem failure', async function () {
            await withCompilerWorkspace(async function (workspace) {
                const { observed } = await observeSource(workspace);
                const snapshot = observed.snapshot() ?? undefined;
                assertDefined(snapshot);
                assert.strictEqual(
                    await compilerInputsAreCurrent({
                        ...workspace.fileManager,
                        async readFile() {
                            throw new Error('Filesystem unavailable');
                        }
                    }, snapshot),
                    false
                );
            });
        });

        test('forwards writes without recording them as compiler reads', async function () {
            await withCompilerWorkspace(async function (workspace) {
                const file = path.join(workspace.folder, 'written.js');
                const observed = observeCompilerInputs(workspace.fileSystemHost);
                await observed.fileSystemHost.writeFile(file, 'export const value = 1;');
                assert.strictEqual(await workspace.fileManager.readFile(file), 'export const value = 1;');
                assert.deepStrictEqual(observed.snapshot(), []);
            });
        });

        test('preserves host results when their metadata cannot be cached', function () {
            const entries = [ { name: '/virtual/file', isDirectory: false, isSymlink: false } ];
            const host = new Proxy(new InMemoryFileSystemHost(), {
                get(target, property) {
                    return property === 'readDirSync'
                        ? function () {
                            return entries;
                        }
                        : Reflect.get(target, property) as unknown;
                }
            });
            const observed = observeCompilerInputs(host);
            assert.strictEqual(invoke(observed.fileSystemHost, 'readDirSync', [ '/virtual' ]), entries);
            assert.strictEqual(observed.snapshot(), null);
        });

        test('observes dangling symlink targets becoming available outside the listed directory', async function () {
            await withCompilerWorkspace(async function (workspace) {
                const folder = path.join(workspace.folder, 'observed');
                await Promise.all([
                    workspace.write('target/anchor.js', ''),
                    workspace.write('observed/anchor.js', '')
                ]);
                await fileSystem.symlink(
                    path.join(workspace.folder, 'target/missing.js'),
                    path.join(folder, 'link.js')
                );
                const snapshot = observeDirectory(workspace, folder);
                assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), true);
                await workspace.write('target/missing.js', 'export const value = 1;');
                assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), false);
            });
        });
    });

    test('compares directory contents independently of enumeration order', async function () {
        await withCompilerWorkspace(async function (workspace) {
            await Promise.all([ workspace.write('first.js', ''), workspace.write('second.js', '') ]);
            const snapshot = observeDirectory(workspace, workspace.folder);
            assert.strictEqual(
                await compilerInputsAreCurrent({
                    ...workspace.fileManager,
                    async listDirectoryEntries(folder) {
                        const entries = await workspace.fileManager.listDirectoryEntries(folder);
                        return entries.toReversed();
                    }
                }, snapshot),
                true
            );
        });
    });

    for (const method of [ 'readFileSync', 'fileExistsSync', 'directoryExistsSync', 'readDirSync', 'realpathSync' ]) {
        test(`validates the observed ${method} result`, async function () {
            await withCompilerWorkspace(async function (workspace) {
                const file = await workspace.write('source.js', 'export const value = 1;');
                const observed = observeCompilerInputs(workspace.fileSystemHost);
                invoke(observed.fileSystemHost, method, [
                    method.toLowerCase().includes('dir') ? workspace.folder : file
                ]);
                const snapshot = observed.snapshot() ?? undefined;
                assertDefined(snapshot);
                assert.strictEqual(snapshot.length, 1);
                assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), true);
            });
        });
    }

    test('invalidates changed file contents and negative file and directory lookups', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const { observed } = await observeSource(workspace);
            invoke(observed.fileSystemHost, 'fileExistsSync', [ path.join(workspace.folder, 'missing.js') ]);
            invoke(observed.fileSystemHost, 'directoryExistsSync', [ path.join(workspace.folder, 'missing') ]);
            await workspace.write('source.js', 'second');
            const snapshot = observed.snapshot() ?? undefined;
            assertDefined(snapshot);
            assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), false);
        });
    });

    test('rejects a snapshot when an input changes during analysis', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const { file, observed } = await observeSource(workspace);
            await workspace.write('source.js', 'second');
            invoke(observed.fileSystemHost, 'readFileSync', [ file ]);
            assert.strictEqual(observed.snapshot(), null);
        });
    });

    test('observes unreadable paths becoming readable', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const file = path.join(workspace.folder, 'missing.js');
            const observed = observeCompilerInputs(workspace.fileSystemHost);
            assert.throws(function () {
                invoke(observed.fileSystemHost, 'readFileSync', [ file ]);
            }, /not found/u);
            const snapshot = observed.snapshot() ?? undefined;
            assertDefined(snapshot);
            assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), true);
            await workspace.write('missing.js', 'available');
            assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), false);
        });
    });

    test('observes deleted files and directory entries', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const { file, observed } = await observeSource(workspace);
            invoke(observed.fileSystemHost, 'readDirSync', [ workspace.folder ]);
            await fileSystem.rm(file);
            const snapshot = observed.snapshot() ?? undefined;
            assertDefined(snapshot);
            assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), false);
        });
    });

    test('checks symlink targets in directory observations', async function () {
        await withCompilerWorkspace(async function (workspace) {
            await workspace.write('directory/source.js', 'first');
            await fileSystem.symlink(path.join(workspace.folder, 'directory'), path.join(workspace.folder, 'link'));
            const snapshot = observeDirectory(workspace, workspace.folder);
            assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), true);
        });
    });

    suite('unsupported observations', function () {
        test('declines reuse for asynchronous reads', async function () {
            await withCompilerWorkspace(async function (workspace) {
                const file = await workspace.write('source.js', 'first');
                const observed = observeCompilerInputs(workspace.fileSystemHost);
                assert.strictEqual(await observed.fileSystemHost.readFile(file), 'first');
                assert.strictEqual(observed.snapshot(), null);
            });
        });

        for (const method of [ 'glob', 'globSync' ]) {
            test(`declines reuse for ${method} observations`, async function () {
                await withCompilerWorkspace(async function (workspace) {
                    await workspace.write('source.js', 'first');
                    const observed = observeCompilerInputs(workspace.fileSystemHost);
                    assert.strictEqual(Reflect.get(observed.fileSystemHost, 'missing-property'), undefined);
                    assert.strictEqual(
                        observed.fileSystemHost.isCaseSensitive(),
                        workspace.fileSystemHost.isCaseSensitive()
                    );
                    assert.deepStrictEqual(observed.snapshot(), []);
                    await invoke(observed.fileSystemHost, method, [ [ `${workspace.folder}/*.js` ] ]);
                    assert.strictEqual(observed.snapshot(), null);
                });
            });
        }
    });
});
