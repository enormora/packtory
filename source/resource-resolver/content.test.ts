import test from 'ava';
import { combineAllBundleFiles } from './content.js';

test('combines all bundle files correctly', (t) => {
    const result = combineAllBundleFiles('/foo', [], []);
    t.deepEqual(result, []);
});
