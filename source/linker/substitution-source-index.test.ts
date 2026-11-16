import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createPathReplacementWorkload } from '../test-libraries/path-replacement-workload.ts';
import { createPublicModuleUsageWorkload } from '../test-libraries/public-module-usage-workload.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createPathReplacementLookup, type ImportPathReplacementRequest } from './replacement-lookup.ts';
import { createSubstitutionSourceIndex } from './substitution-source-index.ts';

function assertNamedReplacements(
    lookup: ReturnType<typeof createPathReplacementLookup>,
    requests: readonly ImportPathReplacementRequest[]
): void {
    for (const request of requests) {
        assert.deepStrictEqual(lookup([ request ]).importPathReplacements.get(request.inputFilePath), {
            packageName: 'replacement-package',
            emittedSpecifier: 'replacement-package'
        });
    }
}

suite('substitution source indexes', function () {
    test('resolves a public root without reading its re-export graph', function () {
        const workload = createPathReplacementWorkload(3, 2);
        const lookup = createPathReplacementLookup([], [ workload.bundle ]);
        const result = lookup([ {
            inputFilePath: '/source/entry.js',
            requiredExportNames: new Set([ 'value0_0', 'value1_0', 'value2_0' ]),
            requiresNamespaceExport: true
        } ]);

        assert.deepStrictEqual(result.importPathReplacements.get('/source/entry.js'), {
            packageName: workload.bundle.name,
            emittedSpecifier: workload.bundle.name
        });
        assert.strictEqual(workload.sourceReads(), 0);
    });

    test('indexes each named export without including it among export stars', function () {
        const workload = createPathReplacementWorkload(2, 2);
        const index = createSubstitutionSourceIndex(workload.bundle);
        const root = index.contentBySourcePath.get('/source/entry.js');
        assertDefined(root);
        const declarations = index.exportsOf(root);

        assert.deepStrictEqual({
            declarationCount: declarations.all.length,
            stars: declarations.stars,
            firstModule: declarations.named.get('value0_0'),
            secondModule: declarations.named.get('value1_0')
        }, {
            declarationCount: 2,
            stars: [],
            firstModule: [ declarations.all[0] ],
            secondModule: [ declarations.all[1] ]
        });
    });

    test('resolves export targets without adding absent declaration companions', function () {
        const workload = createPathReplacementWorkload(1, 1);
        const index = createSubstitutionSourceIndex(workload.bundle);
        const [ root ] = workload.bundle.contents;
        assertDefined(root);
        const [ declaration ] = index.exportsOf(root).all;
        assertDefined(declaration);

        assert.deepStrictEqual(index.inputPathsForExport('entry.js', declaration), [ '/source/module-0.js' ]);
    });

    test('does not read peer exports for an unowned source', function () {
        const workload = createPathReplacementWorkload(1, 1);
        const lookup = createPathReplacementLookup([], [ workload.bundle ]);
        const result = lookup([ {
            inputFilePath: '/unrelated.js',
            requiredExportNames: new Set([ 'value0_0' ]),
            requiresNamespaceExport: false
        } ]);

        assert.strictEqual(result.importPathReplacements.size, 0);
        assert.strictEqual(workload.sourceReads(), 0);
    });

    test('resolves public root paths without requiring their source in the contents index', function () {
        const workload = createPathReplacementWorkload(1, 1);
        const lookup = createPathReplacementLookup([], [ { ...workload.bundle, contents: [] } ]);
        const result = lookup([ {
            inputFilePath: '/source/entry.js',
            requiredExportNames: new Set([ 'value0_0' ]),
            requiresNamespaceExport: false
        } ]);

        assert.deepStrictEqual(result.importPathReplacements.get('/source/entry.js'), {
            packageName: workload.bundle.name,
            emittedSpecifier: workload.bundle.name
        });
    });

    test('rejects internal paths when their public root source is unavailable', function () {
        const workload = createPathReplacementWorkload(1, 1);
        const lookup = createPathReplacementLookup([], [ {
            ...workload.bundle,
            contents: workload.bundle.contents.slice(1)
        } ]);

        assert.throws(function () {
            lookup(workload.requests);
        }, /does not expose/u);
    });

    test('reads peer exports once across repeated named requests', function () {
        const moduleCount = 3;
        const exportsPerModule = 2;
        const workload = createPathReplacementWorkload(moduleCount, exportsPerModule);
        const lookup = createPathReplacementLookup([], [ workload.bundle ]);
        assertNamedReplacements(lookup, workload.requests);
        const reads = workload.sourceReads();
        assert.ok(reads > 0 && reads <= workload.bundle.contents.length);
        assertNamedReplacements(lookup, workload.requests);
        assert.strictEqual(workload.sourceReads(), reads);
    });

    test('reuses implicit public modules for repeated fallback requests', function () {
        const workload = createPublicModuleUsageWorkload({ moduleCount: 2, importCount: 1, sourcesFolder: '/source' });
        const lookup = createPathReplacementLookup([], [ workload.target ]);
        const requests = [ {
            inputFilePath: '/source/module-1.js',
            requiredExportNames: new Set([ 'value' ]),
            requiresNamespaceExport: false
        } ];
        const first = lookup(requests);
        const reads = workload.surfaceReads();

        assert.deepStrictEqual(lookup(requests), first);
        assert.strictEqual(workload.surfaceReads() - reads, 1);
        assert.deepStrictEqual(first.importPathReplacements.get('/source/module-1.js'), {
            packageName: workload.target.name,
            emittedSpecifier: 'indexed-package/module-1.js'
        });
    });
});
