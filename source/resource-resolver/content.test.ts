import assert from 'node:assert';
import { test } from 'mocha';
import { combineAllBundleFiles } from './content.ts';

test('combines all bundle files correctly', () => {
    const result = combineAllBundleFiles('/foo', [], []);
    assert.deepStrictEqual(result, []);
});
