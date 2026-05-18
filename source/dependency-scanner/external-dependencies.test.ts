import assert from 'node:assert';
import { suite, test } from 'mocha';
import { mergeExternalDependencies, type ExternalDependency } from './external-dependencies.ts';

function asMap(...entries: readonly ExternalDependency[]): ReadonlyMap<string, ExternalDependency> {
    return new Map(entries.map((entry) => [entry.name, entry]));
}

suite('external-dependencies', function () {
    test('mergeExternalDependencies returns the first map when the second is empty', function () {
        const a = asMap({ name: 'lodash', referencedFrom: ['/a.ts'] });
        const merged = mergeExternalDependencies(a, asMap());
        assert.deepStrictEqual(Array.from(merged), Array.from(a));
    });

    test('mergeExternalDependencies adds entries that exist only in the second map', function () {
        const merged = mergeExternalDependencies(
            asMap({ name: 'lodash', referencedFrom: ['/a.ts'] }),
            asMap({ name: 'react', referencedFrom: ['/b.ts'] })
        );
        assert.deepStrictEqual(Array.from(merged.keys()), ['lodash', 'react']);
    });

    test('mergeExternalDependencies unions the referencedFrom paths for entries present in both maps', function () {
        const merged = mergeExternalDependencies(
            asMap({ name: 'lodash', referencedFrom: ['/a.ts'] }),
            asMap({ name: 'lodash', referencedFrom: ['/b.ts'] })
        );

        assert.deepStrictEqual(merged.get('lodash')?.referencedFrom, ['/a.ts', '/b.ts']);
    });

    test('mergeExternalDependencies deduplicates duplicate referencedFrom entries', function () {
        const merged = mergeExternalDependencies(
            asMap({ name: 'lodash', referencedFrom: ['/a.ts', '/b.ts'] }),
            asMap({ name: 'lodash', referencedFrom: ['/b.ts', '/c.ts'] })
        );

        assert.deepStrictEqual(merged.get('lodash')?.referencedFrom, ['/a.ts', '/b.ts', '/c.ts']);
    });
});
