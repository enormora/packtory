import assert from 'node:assert';
import { test } from 'mocha';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { analyzedBundleResource, linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from '../reachability/binding-extractor.ts';
import { bindingId, buildReachabilityIndex, type FileBindings } from '../reachability/reachability.ts';
import { buildCrossBundleSeeds, type CrossBundleInput, type SeedMap } from './cross-bundle-seeds.ts';

function bundleWith(
    name: string,
    files: readonly { readonly sourceFilePath: string; readonly targetFilePath: string; readonly content: string }[]
): LinkedBundle {
    return linkedBundle({
        name,
        contents: files.map((file) => {
            return analyzedBundleResource(file.sourceFilePath, {
                content: file.content,
                targetFilePath: file.targetFilePath
            });
        })
    });
}

function inputFor(
    bundle: LinkedBundle,
    files: readonly { readonly sourceFilePath: string; readonly content: string }[]
): CrossBundleInput {
    const project = createProject({
        withFiles: files.map((file) => {
            return { filePath: file.sourceFilePath, content: file.content };
        })
    });
    const sourceFiles = files.map((file) => {
        return project.getSourceFileOrThrow(file.sourceFilePath);
    });
    const fileBindings: readonly FileBindings[] = sourceFiles.map((sourceFile) => {
        return {
            sourceFilePath: sourceFile.getFilePath(),
            sourceFile,
            bindings: extractTopLevelBindings(sourceFile)
        };
    });
    const { localReachable } = buildReachabilityIndex({
        files: fileBindings,
        entryPointFilePaths: new Set(files.map((file) => file.sourceFilePath))
    });
    return { bundle, sourceFiles, fileBindings, localReachable };
}

test('returns empty map when no bundles are given', () => {
    const seeds = buildCrossBundleSeeds([]);
    assert.strictEqual(seeds.size, 0);
});

test('returns empty seeds for a single bundle with no cross-bundle imports', () => {
    const bundle = bundleWith('pkg-a', [
        { sourceFilePath: '/a/index.ts', targetFilePath: 'index.ts', content: 'export const x = 1;' }
    ]);
    const input = inputFor(bundle, [{ sourceFilePath: '/a/index.ts', content: 'export const x = 1;' }]);
    const seeds = buildCrossBundleSeeds([input]);
    assert.strictEqual(seeds.size, 0);
});

test('records a named import as a seed in the target bundle', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/helpers.ts',
            targetFilePath: 'helpers.ts',
            content: 'export function used() { return 1; }\nexport function unused() { return 2; }'
        }
    ]);
    const consumerInput = inputFor(consumer, [
        {
            sourceFilePath: '/a/index.ts',
            content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
        }
    ]);
    const producerInput = inputFor(producer, [
        {
            sourceFilePath: '/b/helpers.ts',
            content: 'export function used() { return 1; }\nexport function unused() { return 2; }'
        }
    ]);
    const seeds = buildCrossBundleSeeds([consumerInput, producerInput]);
    const bSeeds = seeds.get('pkg-b');
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'used')));
    assert.strictEqual(bSeeds.has(bindingId('/b/helpers.ts', 'unused')), false);
    assert.strictEqual(bSeeds.has(bindingId('/b/helpers.ts', 'default')), false);
});

test('records a default import as a "default" binding seed', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import dep from "pkg-b/main.ts";\nexport function pub() { return dep; }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/main.ts',
            targetFilePath: 'main.ts',
            content: 'export default 42;'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import dep from "pkg-b/main.ts";\nexport function pub() { return dep; }'
            }
        ]),
        inputFor(producer, [{ sourceFilePath: '/b/main.ts', content: 'export default 42;' }])
    ]);
    const bSeeds = seeds.get('pkg-b');
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/main.ts', 'default')));
});

function seedsForConsumerProducer(consumerContent: string, producerContent: string): ReadonlySet<string> | undefined {
    const consumer = bundleWith('pkg-a', [
        { sourceFilePath: '/a/index.ts', targetFilePath: 'index.ts', content: consumerContent }
    ]);
    const producer = bundleWith('pkg-b', [
        { sourceFilePath: '/b/helpers.ts', targetFilePath: 'helpers.ts', content: producerContent }
    ]);
    return buildCrossBundleSeeds([
        inputFor(consumer, [{ sourceFilePath: '/a/index.ts', content: consumerContent }]),
        inputFor(producer, [{ sourceFilePath: '/b/helpers.ts', content: producerContent }])
    ]).get('pkg-b');
}

function seedsForLoneConsumer(consumerContent: string): SeedMap {
    const consumer = bundleWith('pkg-a', [
        { sourceFilePath: '/a/index.ts', targetFilePath: 'index.ts', content: consumerContent }
    ]);
    return buildCrossBundleSeeds([inputFor(consumer, [{ sourceFilePath: '/a/index.ts', content: consumerContent }])]);
}

function assertHelpersBindingsSeeded(bSeeds: ReadonlySet<string> | undefined): void {
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'a')));
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'b')));
}

test('records a named re-export as a seed in the target bundle', () => {
    const bSeeds = seedsForConsumerProducer(
        'export { used } from "pkg-b/helpers.ts";',
        'export function used() { return 1; }\nexport function unused() { return 2; }'
    );
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'used')));
    assert.strictEqual(bSeeds.has(bindingId('/b/helpers.ts', 'unused')), false);
});

test('records every binding of the target file as a seed for a star re-export', () => {
    assertHelpersBindingsSeeded(
        seedsForConsumerProducer('export * from "pkg-b/helpers.ts";', 'export const a = 1;\nexport const b = 2;')
    );
});

test('records every binding of the target file as a seed for a namespace re-export', () => {
    assertHelpersBindingsSeeded(
        seedsForConsumerProducer(
            'export * as helpers from "pkg-b/helpers.ts";',
            'export const a = 1;\nexport const b = 2;'
        )
    );
});

test('ignores a bare local re-export with no module specifier', () => {
    const seeds = seedsForLoneConsumer('function local() { return 1; }\nexport { local };');
    assert.strictEqual(seeds.size, 0);
});

test('does not record a re-export seed when the specifier does not match any bundle name', () => {
    const seeds = seedsForLoneConsumer('export { x } from "external-pkg";');
    assert.strictEqual(seeds.size, 0);
});

test('records every binding of the target file as a seed for a namespace import', () => {
    assertHelpersBindingsSeeded(
        seedsForConsumerProducer(
            'import * as helpers from "pkg-b/helpers.ts";\nexport function pub() { return helpers; }',
            'export const a = 1;\nexport const b = 2;'
        )
    );
});

test('does not record a seed when the specifier matches a bundle name but not any file in that bundle', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import { used } from "pkg-b/missing.ts";\nexport function pub() { return used(); }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/helpers.ts',
            targetFilePath: 'helpers.ts',
            content: 'export function used() { return 1; }'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import { used } from "pkg-b/missing.ts";\nexport function pub() { return used(); }'
            }
        ]),
        inputFor(producer, [{ sourceFilePath: '/b/helpers.ts', content: 'export function used() { return 1; }' }])
    ]);
    assert.strictEqual(seeds.size, 0);
});

test('does not record seeds for a namespace import that targets a file with no extracted bindings', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import * as data from "pkg-b/data.json";\nexport function pub() { return data; }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/data.json',
            targetFilePath: 'data.json',
            content: '{}'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import * as data from "pkg-b/data.json";\nexport function pub() { return data; }'
            }
        ]),
        { bundle: producer, sourceFiles: [], fileBindings: [], localReachable: new Set<string>() }
    ]);
    assert.strictEqual(seeds.size, 0);
});

test('records seeds only in the bundle whose name prefixes the specifier, not in other bundles that share a target file path', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
        },
        {
            sourceFilePath: '/a/helpers.ts',
            targetFilePath: 'helpers.ts',
            content: 'export function used() { return 0; }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/helpers.ts',
            targetFilePath: 'helpers.ts',
            content: 'export function used() { return 1; }'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
            },
            { sourceFilePath: '/a/helpers.ts', content: 'export function used() { return 0; }' }
        ]),
        inputFor(producer, [{ sourceFilePath: '/b/helpers.ts', content: 'export function used() { return 1; }' }])
    ]);
    assert.strictEqual(seeds.has('pkg-a'), false);
    const bSeeds = seeds.get('pkg-b');
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'used')));
});

test('does not seed a named import whose local binding is only referenced by unreachable code', () => {
    const bSeeds = seedsForConsumerProducer(
        'import { used } from "pkg-b/helpers.ts";\nfunction dead() { return used(); }\nexport function pub() { return 1; }',
        'export function used() { return 1; }'
    );
    assert.strictEqual(bSeeds, undefined);
});

test('does not seed a default import whose local binding is only referenced by unreachable code', () => {
    const bSeeds = seedsForConsumerProducer(
        'import dep from "pkg-b/helpers.ts";\nfunction dead() { return dep; }\nexport function pub() { return 1; }',
        'export default 42;'
    );
    assert.strictEqual(bSeeds, undefined);
});

test('does not seed a namespace import whose local binding is only referenced by unreachable code', () => {
    const bSeeds = seedsForConsumerProducer(
        'import * as helpers from "pkg-b/helpers.ts";\nfunction dead() { return helpers; }\nexport function pub() { return 1; }',
        'export const a = 1;\nexport const b = 2;'
    );
    assert.strictEqual(bSeeds, undefined);
});

test('uses the aliased local name to gate seeding for renamed named imports', () => {
    const bSeeds = seedsForConsumerProducer(
        'import { used as renamed } from "pkg-b/helpers.ts";\nexport function pub() { return renamed(); }',
        'export function used() { return 1; }'
    );
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'used')));
});

test('does not seed a renamed named import whose aliased local binding is unreachable', () => {
    const bSeeds = seedsForConsumerProducer(
        'import { used as renamed } from "pkg-b/helpers.ts";\nfunction dead() { return renamed(); }\nexport function pub() { return 1; }',
        'export function used() { return 1; }'
    );
    assert.strictEqual(bSeeds, undefined);
});

test('seeds only the named imports whose local bindings are referenced by reachable code', () => {
    const bSeeds = seedsForConsumerProducer(
        [
            'import { used, alsoDead } from "pkg-b/helpers.ts";',
            'function dead() { return alsoDead(); }',
            'export function pub() { return used(); }'
        ].join('\n'),
        'export function used() { return 1; }\nexport function alsoDead() { return 2; }'
    );
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'used')));
    assert.strictEqual(bSeeds.has(bindingId('/b/helpers.ts', 'alsoDead')), false);
});

test('does not record a seed for an import that does not match any bundle name', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import { x } from "external-pkg";\nexport function pub() { return x; }'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import { x } from "external-pkg";\nexport function pub() { return x; }'
            }
        ])
    ]);
    assert.strictEqual(seeds.size, 0);
});
