import assert from 'node:assert';
import { test } from 'mocha';
import type { FileSystemHost } from 'ts-morph';
import { bindRequiredMethod, isBoolean, isString, syncMethodNames } from './host-method-binding.ts';

test('isBoolean returns true only for boolean primitives', () => {
    assert.strictEqual(isBoolean(true), true);
    assert.strictEqual(isBoolean(false), true);
    assert.strictEqual(isBoolean('true'), false);
    assert.strictEqual(isBoolean(1), false);
});

test('isString returns true only for string primitives', () => {
    assert.strictEqual(isString('x'), true);
    assert.strictEqual(isString(''), true);
    assert.strictEqual(isString(undefined), false);
});

test('syncMethodNames maps each async name to its synchronous counterpart', () => {
    assert.deepStrictEqual(syncMethodNames, {
        fileExists: 'fileExistsSync',
        directoryExists: 'directoryExistsSync',
        readFile: 'readFileSync'
    });
});

test('bindRequiredMethod throws when the host does not expose the named method', () => {
    const host = {} as unknown as FileSystemHost;
    try {
        bindRequiredMethod(host, 'missingMethod', 'a string', isString);
        assert.fail('expected bindRequiredMethod to throw');
    } catch (error) {
        assert.ok(error instanceof TypeError);
        assert.strictEqual(error.message, 'Expected missingMethod to be a function');
    }
});

test('bindRequiredMethod returns a callable that forwards the file path to the method', () => {
    const calls: string[] = [];
    const host = {
        readFileSync(filePath: string) {
            calls.push(filePath);
            return 'content';
        }
    } as unknown as FileSystemHost;

    const read = bindRequiredMethod(host, 'readFileSync', 'a string', isString);

    assert.strictEqual(read('/p/a.ts'), 'content');
    assert.deepStrictEqual(calls, ['/p/a.ts']);
});

test('bindRequiredMethod throws when the method returns a value that fails validation', () => {
    const host = { readFileSync: () => 42 } as unknown as FileSystemHost;
    const read = bindRequiredMethod(host, 'readFileSync', 'a string', isString);

    try {
        read('/p/a.ts');
        assert.fail('expected the bound method to throw');
    } catch (error) {
        assert.ok(error instanceof TypeError);
        assert.strictEqual(error.message, 'Expected readFileSync to return a string');
    }
});
