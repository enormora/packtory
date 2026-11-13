import assert from 'node:assert';
import { suite, test } from 'mocha';
import { withCompilerWorkspace } from '../test-libraries/compiler-workspace.ts';
import { contentDigest } from '../common/value-fingerprint.ts';
import { createCompilerInputValidator } from './compiler-input-validator.ts';
import type { CompilerInputs } from './compiler-inputs.ts';

suite('compiler input validation scopes', function () {
    test('shares real path reads within a scope and validates them outside it', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const filePath = await workspace.write('source.js', 'first');
            let reads = 0;
            const validator = createCompilerInputValidator({
                ...workspace.fileManager,
                async getRealPath(sourcePath) {
                    reads += 1;
                    return workspace.fileManager.getRealPath(sourcePath);
                }
            });
            const inputs: CompilerInputs = [ {
                operation: 'realpath',
                filePath,
                value: JSON.stringify(await workspace.fileManager.getRealPath(filePath))
            } ];
            await validator.run(async function () {
                assert.strictEqual(await validator.isCurrent(inputs), true);
                assert.strictEqual(await validator.isCurrent(inputs), true);
                assert.strictEqual(reads, 1);
            });
            assert.strictEqual(await validator.isCurrent(inputs), true);
            assert.strictEqual(reads, 2);
        });
    });

    test('validates directory listings within a snapshot and outside an operation', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const filePath = await workspace.write('source.js', 'first');
            const inputs: CompilerInputs = [ {
                operation: 'readDir',
                filePath: workspace.folder,
                value: JSON.stringify([ { name: filePath, isDirectory: false, isSymlink: false } ])
            } ];
            await workspace.inputValidator.run(async function () {
                assert.strictEqual(await workspace.inputValidator.isCurrent(inputs), true);
                assert.strictEqual(await workspace.inputValidator.isCurrent(inputs), true);
            });
            assert.strictEqual(await workspace.inputValidator.isCurrent(inputs), true);
        });
    });

    test('shares reads within an operation and observes edits in the following operation', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const filePath = await workspace.write('source.js', 'first');
            let reads = 0;
            const validator = createCompilerInputValidator({
                ...workspace.fileManager,
                async readFile(sourcePath) {
                    reads += 1;
                    return workspace.fileManager.readFile(sourcePath);
                }
            });
            const inputs: CompilerInputs = [ { operation: 'readFile', filePath, value: contentDigest('first') } ];
            const result = await validator.run(async function () {
                assert.deepStrictEqual(
                    await Promise.all([ validator.isCurrent(inputs), validator.isCurrent(inputs) ]),
                    [ true, true ]
                );
                assert.strictEqual(reads, 1);
                return 'analyzed';
            });
            assert.strictEqual(result, 'analyzed');
            await workspace.write('source.js', 'second');
            await validator.run(async function () {
                assert.strictEqual(await validator.isCurrent(inputs), false);
                assert.strictEqual(reads, 2);
            });
        });
    });

    test('does not retain observations outside an operation', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const filePath = await workspace.write('source.js', 'first');
            const inputs: CompilerInputs = [ { operation: 'readFile', filePath, value: contentDigest('first') } ];
            assert.strictEqual(await workspace.inputValidator.isCurrent(inputs), true);
            await workspace.write('source.js', 'second');
            assert.strictEqual(await workspace.inputValidator.isCurrent(inputs), false);
        });
    });
});
