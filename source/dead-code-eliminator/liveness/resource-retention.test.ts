import assert from 'node:assert';
import { suite, test } from 'mocha';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { pruneContents } from './resource-retention.ts';

suite('resource retention', function () {
    test('closes cyclic dependencies once and removes maps of pruned resources', function () {
        let dependencyReads = 0;
        const entry = {
            ...analyzedBundleResource('/source/index.js'),
            get directDependencies() {
                dependencyReads += 1;
                assert.ok(dependencyReads <= 1, 'Retained resources must not be expanded twice');
                return new Set([ 'helper.js', 'missing.js' ]);
            }
        };
        const contents = [
            entry,
            analyzedBundleResource('/source/helper.js', { directDependencies: new Set([ 'index.js' ]) }),
            analyzedBundleResource('/source/unused.js'),
            analyzedBundleResource('/source/unused.js.map'),
            analyzedBundleResource('/source/index.js.map'),
            analyzedBundleResource('/source/pinned.js', { isExplicitlyIncluded: true }),
            analyzedBundleResource('/source/data.json')
        ];
        const retained = pruneContents(analyzedBundle(), contents, true, undefined);
        assert.deepStrictEqual(
            retained.map(function (resource) {
                return resource.fileDescription.targetFilePath;
            }),
            [ 'index.js', 'helper.js', 'index.js.map', 'pinned.js', 'data.json' ]
        );
        assert.strictEqual(dependencyReads, 1);
    });

    test('keeps explicitly included maps even when their source is pruned', function () {
        const map = analyzedBundleResource('/source/unused.js.map', { isExplicitlyIncluded: true });
        assert.deepStrictEqual(
            pruneContents(analyzedBundle(), [ analyzedBundleResource('/source/unused.js'), map ], true, undefined),
            [ map ]
        );
    });
});
