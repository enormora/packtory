import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { InMemoryFileSystemHost, type FileSystemHost } from 'ts-morph';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    withInMemoryCompilerWorkspace,
    type InMemoryCompilerWorkspace
} from '../test-libraries/in-memory-compiler-workspace.ts';
import {
    compilerInputsAreCurrent,
    compilerInputsSchema,
    observeCompilerInputs,
    type CompilerInputObservation,
    type CompilerInputs
} from './compiler-inputs.ts';

function invoke(host: FileSystemHost, method: string, parameters: readonly unknown[]): unknown {
    const member: unknown = Reflect.get(host, method);
    if (typeof member !== 'function') {
        throw new TypeError('Expected a host method');
    }
    return Reflect.apply(member, host, parameters);
}
function observeDirectory(workspace: InMemoryCompilerWorkspace, folder: string): CompilerInputs {
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
async function observeSource(workspace: InMemoryCompilerWorkspace): Promise<SourceObservation> {
    const file = await workspace.write('source.js', 'first');
    const observed = observeCompilerInputs(workspace.fileSystemHost);
    invoke(observed.fileSystemHost, 'readFileSync', [ file ]);
    return {
        file,
        observed
    };
}

suite('compiler input freshness', function () {
    suite('unsupported metadata and symlink changes', function () {
        test('rejects previously readable inputs after a filesystem failure', async function () {
            await withInMemoryCompilerWorkspace(async function (workspace) {
                const {
                    observed
                } = await observeSource(workspace);
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
            await withInMemoryCompilerWorkspace(async function (workspace) {
                const file = path.join(workspace.folder, 'written.js');
                const observed = observeCompilerInputs(workspace.fileSystemHost);
                await observed.fileSystemHost.writeFile(file, 'export const value = 1;');
                assert.strictEqual(await workspace.fileManager.readFile(file), 'export const value = 1;');
                assert.deepStrictEqual(observed.snapshot(), []);
            });
        });

        test('preserves invalid-path errors without recording invalid compiler inputs', function () {
            const observed = observeCompilerInputs(new InMemoryFileSystemHost());
            assert.throws(function () {
                invoke(observed.fileSystemHost, 'fileExistsSync', []);
            }, TypeError);
            assert.deepStrictEqual(observed.snapshot(), []);
        });

        test('declines reuse when a host returns source contents as binary data', function () {
            const content = Buffer.from('export const value = 1;');
            const host = new Proxy(new InMemoryFileSystemHost(), {
                get(target, property) {
                    return property === 'readFileSync'
                        ? function () {
                            return content;
                        }
                        : Reflect.get(target, property) as unknown;
                }
            });
            const observed = observeCompilerInputs(host);
            assert.strictEqual(invoke(observed.fileSystemHost, 'readFileSync', [ '/source.js' ]), content);
            assert.strictEqual(observed.snapshot(), null);
        });

        test('preserves host results when their metadata cannot be cached', function () {
            const entries = [ {
                name: '/virtual/file',
                isDirectory: false,
                isSymlink: false
            } ];
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
    });

    test('compares directory contents independently of enumeration order', async function () {
        await withInMemoryCompilerWorkspace(async function (workspace) {
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
            await withInMemoryCompilerWorkspace(async function (workspace) {
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
        await withInMemoryCompilerWorkspace(async function (workspace) {
            const {
                observed
            } = await observeSource(workspace);
            invoke(observed.fileSystemHost, 'fileExistsSync', [ path.join(workspace.folder, 'missing.js') ]);
            invoke(observed.fileSystemHost, 'directoryExistsSync', [ path.join(workspace.folder, 'missing') ]);
            await workspace.write('source.js', 'second');
            const snapshot = observed.snapshot() ?? undefined;
            assertDefined(snapshot);
            assert.strictEqual(await compilerInputsAreCurrent(workspace.fileManager, snapshot), false);
        });
    });

    test('rejects a snapshot when an input changes during analysis', async function () {
        await withInMemoryCompilerWorkspace(async function (workspace) {
            const {
                file,
                observed
            } = await observeSource(workspace);
            await workspace.write('source.js', 'second');
            invoke(observed.fileSystemHost, 'readFileSync', [ file ]);
            assert.strictEqual(observed.snapshot(), null);
        });
    });

    test('observes unreadable paths becoming readable', async function () {
        await withInMemoryCompilerWorkspace(async function (workspace) {
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

    suite('unsupported observations', function () {
        for (const method of [ 'readFile', 'fileExists', 'directoryExists' ]) {
            test(`declines reuse for asynchronous ${method}`, async function () {
                await withInMemoryCompilerWorkspace(async function (workspace) {
                    const file = await workspace.write('source.js', 'first');
                    const observed = observeCompilerInputs(workspace.fileSystemHost);
                    const parameters = [ method.toLowerCase().includes('dir') ? workspace.folder : file ];
                    assert.deepStrictEqual(
                        await invoke(observed.fileSystemHost, method, parameters),
                        await invoke(workspace.fileSystemHost, method, parameters)
                    );
                    assert.strictEqual(observed.snapshot(), null);
                });
            });
        }
        for (const method of [ 'glob', 'globSync' ]) {
            test(`declines reuse for ${method} observations`, async function () {
                await withInMemoryCompilerWorkspace(async function (workspace) {
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

    suite('recorded observations', function () {
        test('records symlink target existence independently of its directory entry', function () {
            const host = new Proxy(new InMemoryFileSystemHost(), {
                get(target, property) {
                    if (property === 'readDirSync') {
                        return function () {
                            return [ {
                                name: '/virtual/link.js',
                                isFile: true,
                                isDirectory: false,
                                isSymlink: true
                            } ];
                        };
                    }
                    const member: unknown = Reflect.get(target, property);
                    return member;
                }
            });
            const observed = observeCompilerInputs(host);
            invoke(observed.fileSystemHost, 'readDirSync', [ '/virtual' ]);
            assert.deepStrictEqual(observed.snapshot(), [ {
                operation: 'fileExists',
                filePath: '/virtual/link.js',
                value: 'true'
            }, {
                operation: 'readDir',
                filePath: '/virtual',
                value: JSON.stringify([ {
                    name: '/virtual/link.js',
                    isDirectory: false,
                    isSymlink: true
                } ])
            } ]);
        });
        for (
            const [ status, isDirectory ] of [ [ {
                exists: false
            }, false ], [ {
                exists: true,
                isDirectory: false
            }, false ], [ {
                exists: true,
                isDirectory: true
            }, true ] ] as const
        ) {
            test(`validates symlink directory targets: ${JSON.stringify(status)}`, async function () {
                const fileManager = createFakeFileManager({
                    simulatedListDirectoryResponses: [ {
                        value: [ {
                            name: 'link',
                            isDirectory: false,
                            isSymbolicLink: true
                        } ]
                    } ],
                    simulatedCheckDirectoryResponses: [ {
                        value: status
                    } ]
                });
                const current = await compilerInputsAreCurrent(fileManager, [ {
                    operation: 'readDir',
                    filePath: '/folder',
                    value: JSON.stringify([ {
                        name: '/folder/link',
                        isDirectory,
                        isSymlink: true
                    } ])
                } ]);
                assert.strictEqual(current, true);
                assert.deepStrictEqual(fileManager.getAllCheckDirectoryCalls(), [ {
                    fileOrFolderPath: '/folder/link'
                } ]);
            });
        }
    });
});
