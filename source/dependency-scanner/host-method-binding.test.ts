import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isString } from 'remeda';
import type { FileSystemHost } from 'ts-morph';
import { bindRequiredMethod, syncMethodNames } from './host-method-binding.ts';

suite('host-method-binding', function () {
    test('syncMethodNames maps each async name to its synchronous counterpart', function () {
        assert.deepStrictEqual(syncMethodNames, {
            fileExists: 'fileExistsSync',
            directoryExists: 'directoryExistsSync',
            readFile: 'readFileSync'
        });
    });

    test('bindRequiredMethod throws when the host does not expose the named method', function () {
        const host = {} as unknown as FileSystemHost;
        try {
            bindRequiredMethod(host, 'missingMethod', 'a string', isString);
            assert.fail('expected bindRequiredMethod to throw');
        } catch (error) {
            assert.ok(error instanceof TypeError);
            assert.strictEqual(error.message, 'Expected missingMethod to be a function');
        }
    });

    test('bindRequiredMethod returns a callable that forwards the file path to the method', function () {
        const calls: string[] = [];
        const host = {
            readFileSync(filePath: string) {
                calls.push(filePath);
                return 'content';
            }
        } as unknown as FileSystemHost;

        const read = bindRequiredMethod(host, 'readFileSync', 'a string', isString);

        assert.strictEqual(read('/p/a.ts'), 'content');
        assert.deepStrictEqual(calls, [ '/p/a.ts' ]);
    });

    test('bindRequiredMethod throws when the method returns a value that fails validation', function () {
        const host = {
            readFileSync() {
                return 42;
            }
        } as unknown as FileSystemHost;
        const read = bindRequiredMethod(host, 'readFileSync', 'a string', isString);

        try {
            read('/p/a.ts');
            assert.fail('expected the bound method to throw');
        } catch (error) {
            assert.ok(error instanceof TypeError);
            assert.strictEqual(error.message, 'Expected readFileSync to return a string');
        }
    });
});
