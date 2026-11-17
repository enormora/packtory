import assert from 'node:assert';
import fileSystem from 'node:fs/promises';
import path from 'node:path';
import { suite, test } from 'mocha';
import type { FileSystemHost } from 'ts-morph';
import {
    compilerInputsAreCurrent,
    compilerInputsSchema,
    observeCompilerInputs,
    type CompilerInputObservation,
    type CompilerInputs
} from '../../source/dependency-scanner/compiler-inputs.ts';
import { withCompilerWorkspace, type CompilerWorkspace } from '../../source/test-libraries/compiler-workspace.ts';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';

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
    return {
        file,
        observed
    };
}

suite('compiler input freshness', function () {
    suite('unsupported metadata and symlink changes', function () {
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

    test('observes deleted files and directory entries', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const {
                file,
                observed
            } = await observeSource(workspace);
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
});
