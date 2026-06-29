import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { readMutationReport } from './mutation-report-reader.ts';

function createReadFileError(code: string, message: string): Error & { readonly code: string; } {
    return Object.assign(new Error(message), { code });
}

suite('mutation-report-reader', function () {
    test('readMutationReport parses the JSON report from the file manager', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { value: JSON.stringify({ files: { 'source/a.ts': { mutants: [] } } }) } ]
        });

        assert.deepStrictEqual(await readMutationReport('mutation-report.json', fileManager), {
            files: { 'source/a.ts': { mutants: [] } }
        });
    });

    test('readMutationReport passes the requested report path to the file manager', async function () {
        const fileManager = createFakeFileManager({ simulatedReadFileResponses: [ { value: '{}' } ] });

        await readMutationReport('some/path.json', fileManager);

        assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: 'some/path.json' });
    });

    test('readMutationReport throws a missing-report error when the file manager raises ENOENT', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [
                { error: createReadFileError('ENOENT', "ENOENT: no such file or directory, open '/missing.json'") }
            ]
        });

        try {
            await readMutationReport('/missing.json', fileManager);
            assert.fail('Expected readMutationReport() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Mutation report not found at "/missing.json"');
        }
    });

    test('readMutationReport preserves the original ENOENT error as cause', async function () {
        const cause = createReadFileError('ENOENT', "ENOENT: no such file or directory, open '/missing.json'");
        const fileManager = createFakeFileManager({ simulatedReadFileResponses: [ { error: cause } ] });

        try {
            await readMutationReport('/missing.json', fileManager);
            assert.fail('Expected readMutationReport() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).cause, cause);
        }
    });

    test('readMutationReport rethrows non-ENOENT file system errors unchanged', async function () {
        const cause = createReadFileError('EACCES', 'permission denied');
        const fileManager = createFakeFileManager({ simulatedReadFileResponses: [ { error: cause } ] });

        try {
            await readMutationReport('/locked.json', fileManager);
            assert.fail('Expected readMutationReport() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(error, cause);
        }
    });

    test('readMutationReport rethrows invalid JSON parse errors as SyntaxError', async function () {
        const fileManager = createFakeFileManager({ simulatedReadFileResponses: [ { value: '{' } ] });

        try {
            await readMutationReport('mutation-report.json', fileManager);
            assert.fail('Expected readMutationReport() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(error instanceof SyntaxError, true);
        }
    });
});
