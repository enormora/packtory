import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageNameMap } from './package-name-map.ts';

suite('package-name-map', function () {
    test('packageNameMap() indexes entries by package name', function () {
        const indexed = packageNameMap([
            { name: 'alpha', version: '1.0.0' },
            { name: 'beta', version: '2.0.0' }
        ]);

        assert.deepStrictEqual(Array.from(indexed.keys()), ['alpha', 'beta']);
        assert.deepStrictEqual(indexed.get('beta'), { name: 'beta', version: '2.0.0' });
    });
});
