import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createPublicModuleUsageWorkload } from '../test-libraries/public-module-usage-workload.ts';
import { collectPublicModuleUsage } from './public-module-usage.ts';

suite('public module index caching', function () {
    test('indexes each target once despite repeated and unrelated lookups', function () {
        const single = createPublicModuleUsageWorkload({ moduleCount: 48, importCount: 1, sourcesFolder: '/source' });
        const repeated = createPublicModuleUsageWorkload({
            moduleCount: 48,
            importCount: 24,
            sourcesFolder: '/source'
        });
        assert.deepStrictEqual(collectPublicModuleUsage([ single.consumer, single.target ]), single.expectedUsage);
        assert.deepStrictEqual(
            collectPublicModuleUsage([ repeated.consumer, repeated.target ]),
            repeated.expectedUsage
        );
        assert.ok(single.surfaceReads() > 0);
        assert.strictEqual(repeated.surfaceReads(), single.surfaceReads());
    });

    test('does not index targets when no modules are imported', function () {
        const workload = createPublicModuleUsageWorkload({ moduleCount: 48, importCount: 0, sourcesFolder: '/source' });
        assert.deepStrictEqual(collectPublicModuleUsage([ workload.consumer, workload.target ]), new Map());
        assert.strictEqual(workload.surfaceReads(), 0);
    });

    test('observes changed bundles on subsequent invocations', function () {
        const first = createPublicModuleUsageWorkload({ moduleCount: 2, importCount: 1, sourcesFolder: '/first' });
        const second = createPublicModuleUsageWorkload({ moduleCount: 2, importCount: 1, sourcesFolder: '/second' });
        let current = first.target;
        const target = {
            ...current,
            get roots() {
                return current.roots;
            },
            get contents() {
                return current.contents;
            },
            get surface() {
                return current.surface;
            }
        };
        assert.deepStrictEqual(collectPublicModuleUsage([ first.consumer, target ]), first.expectedUsage);
        current = second.target;
        assert.deepStrictEqual(collectPublicModuleUsage([ first.consumer, target ]), second.expectedUsage);
    });
});
