import assert from 'node:assert';
import { suite, test } from 'mocha';
import { mergeExternalDependencies, type ExternalDependency } from './external-dependencies.ts';

function asMap(...entries: readonly ExternalDependency[]): ReadonlyMap<string, ExternalDependency> {
    return new Map(entries.map(function (entry) {
        return [ entry.name, entry ];
    }));
}

suite('external-dependencies', function () {
    test('mergeExternalDependencies returns the first map when the second is empty', function () {
        const firstDependencies = asMap({ name: 'lodash', referencedFrom: [ '/a.ts' ] });
        const merged = mergeExternalDependencies(firstDependencies, asMap());
        assert.deepStrictEqual(Array.from(merged), Array.from(firstDependencies));
    });

    test('mergeExternalDependencies adds entries that exist only in the second map', function () {
        const merged = mergeExternalDependencies(
            asMap({ name: 'lodash', referencedFrom: [ '/a.ts' ] }),
            asMap({ name: 'react', referencedFrom: [ '/b.ts' ] })
        );
        assert.deepStrictEqual(Array.from(merged.keys()), [ 'lodash', 'react' ]);
    });

    test('mergeExternalDependencies unions the referencedFrom paths for entries present in both maps', function () {
        const merged = mergeExternalDependencies(
            asMap({ name: 'lodash', referencedFrom: [ '/a.ts' ] }),
            asMap({ name: 'lodash', referencedFrom: [ '/b.ts' ] })
        );

        assert.deepStrictEqual(merged.get('lodash')?.referencedFrom, [ '/a.ts', '/b.ts' ]);
    });

    test('mergeExternalDependencies deduplicates duplicate referencedFrom entries', function () {
        const merged = mergeExternalDependencies(
            asMap({ name: 'lodash', referencedFrom: [ '/a.ts', '/b.ts' ] }),
            asMap({ name: 'lodash', referencedFrom: [ '/b.ts', '/c.ts' ] })
        );

        assert.deepStrictEqual(merged.get('lodash')?.referencedFrom, [ '/a.ts', '/b.ts', '/c.ts' ]);
    });
});
