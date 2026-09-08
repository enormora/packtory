import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { analyzedBundleResource, linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from '../reachability/binding-extractor.ts';
import { bindingId } from '../reachability/binding-id.ts';
import type { FileBindings } from '../reachability/local-seed-gathering.ts';
import { buildReachabilityIndex } from '../reachability/reachability.ts';
import {
    buildCrossBundleSeeds as buildCrossBundleSeedsWithTrace,
    type CrossBundleInput
} from './cross-bundle-seeds.ts';

type SeedMap = ReadonlyMap<string, ReadonlySet<string>>;
type LinkedBundleResource = LinkedBundle['contents'][number];
const disabledTrace = undefined;

function buildCrossBundleSeeds(inputs: readonly CrossBundleInput[]): SeedMap {
    return buildCrossBundleSeedsWithTrace(inputs, disabledTrace);
}

function assertDefined<T>(value: T | undefined): asserts value is T {
    if (value === undefined) {
        assert.fail('expected value to be defined');
    }
}

function linkedReferencesFrom(content: string): LinkedBundleResource['moduleReferences'] {
    return Array.from(
        content.matchAll(/(?:from|import)\s+"(?<packageName>pkg-[^/"]+)\/(?<targetFilePath>[^"]+)"/gu),
        function (match) {
            const { packageName, targetFilePath } = match.groups ?? {};
            assertDefined(packageName);
            assertDefined(targetFilePath);
            return {
                type: 'linked-code',
                packageName,
                sourceSpecifier: `${packageName}/${targetFilePath}`,
                emittedSpecifier: `${packageName}/${targetFilePath}`,
                targetFilePath
            };
        }
    );
}

function bundleWith(
    name: string,
    files: readonly { readonly inputFilePath: string; readonly targetFilePath: string; readonly content: string; }[]
): LinkedBundle {
    return linkedBundle({
        name,
        contents: files.map(function (file) {
            return analyzedBundleResource(file.inputFilePath, {
                content: file.content,
                targetFilePath: file.targetFilePath,
                moduleReferences: linkedReferencesFrom(file.content)
            });
        })
    });
}

function inputFor(
    bundle: LinkedBundle,
    files: readonly { readonly inputFilePath: string; readonly content: string; }[]
): CrossBundleInput {
    const project = createProject({
        withFiles: files.map(function (file) {
            return { filePath: file.inputFilePath, content: file.content };
        })
    });
    const sourceFiles = files.map(function (file) {
        return project.getSourceFileOrThrow(file.inputFilePath);
    });
    const fileBindings: readonly FileBindings[] = sourceFiles.map(function (sourceFile) {
        const file = files.find(function (candidate) {
            return candidate.inputFilePath === sourceFile.getFilePath();
        });
        assertDefined(file);
        const resource = bundle.contents.find(function (candidate) {
            return candidate.fileDescription.inputFilePath === file.inputFilePath;
        });
        assertDefined(resource);
        return {
            inputFilePath: sourceFile.getFilePath(),
            parsedInputFilePath: sourceFile.getFilePath(),
            targetFilePath: resource.fileDescription.targetFilePath,
            sourceFile,
            moduleReferences: resource.moduleReferences,
            bindings: extractTopLevelBindings(sourceFile)
        };
    });
    const { localReachable } = buildReachabilityIndex({
        bundleName: bundle.name,
        files: fileBindings,
        entryPointFilePaths: new Set(bundle.contents.map(function (resource) {
            return resource.fileDescription.targetFilePath;
        })),
        deadCodeElimination: undefined,
        trace: disabledTrace
    });
    return { bundle, fileBindings, localReachable };
}

function seedsForConsumerProducer(
    consumerContent: string,
    producerContent: string
): ReadonlySet<string> | undefined {
    const consumer = bundleWith('pkg-a', [
        { inputFilePath: '/a/index.ts', targetFilePath: 'index.ts', content: consumerContent }
    ]);
    const producer = bundleWith('pkg-b', [
        { inputFilePath: '/b/helpers.ts', targetFilePath: 'helpers.ts', content: producerContent }
    ]);
    return buildCrossBundleSeeds([
        inputFor(consumer, [ { inputFilePath: '/a/index.ts', content: consumerContent } ]),
        inputFor(producer, [ { inputFilePath: '/b/helpers.ts', content: producerContent } ])
    ])
        .get('pkg-b');
}

function seedsForLoneConsumer(consumerContent: string): SeedMap {
    const consumer = bundleWith('pkg-a', [
        { inputFilePath: '/a/index.ts', targetFilePath: 'index.ts', content: consumerContent }
    ]);
    return buildCrossBundleSeeds([
        inputFor(consumer, [ { inputFilePath: '/a/index.ts', content: consumerContent } ])
    ]);
}

function assertHelpersBindingsSeeded(bSeeds: ReadonlySet<string> | undefined): void {
    assertDefined(bSeeds);
    assert.ok(bSeeds.has(bindingId('helpers.ts', 'a')));
    assert.ok(bSeeds.has(bindingId('helpers.ts', 'b')));
}

suite('cross-bundle-seeds', function () {
    suite('direct cross-bundle imports', function () {
        test('returns empty map when no bundles are given', function () {
            const seeds = buildCrossBundleSeeds([]);
            assert.strictEqual(seeds.size, 0);
        });

        test('returns empty seeds for a single bundle with no cross-bundle imports', function () {
            const bundle = bundleWith('pkg-a', [
                { inputFilePath: '/a/index.ts', targetFilePath: 'index.ts', content: 'export const x = 1;' }
            ]);
            const input = inputFor(bundle, [ { inputFilePath: '/a/index.ts', content: 'export const x = 1;' } ]);
            const seeds = buildCrossBundleSeeds([ input ]);
            assert.strictEqual(seeds.size, 0);
        });

        test('records a named import as a seed in the target bundle', function () {
            const consumer = bundleWith('pkg-a', [
                {
                    inputFilePath: '/a/index.ts',
                    targetFilePath: 'index.ts',
                    content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
                }
            ]);
            const producer = bundleWith('pkg-b', [
                {
                    inputFilePath: '/b/helpers.ts',
                    targetFilePath: 'helpers.ts',
                    content: 'export function used() { return 1; }\nexport function unused() { return 2; }'
                }
            ]);
            const consumerInput = inputFor(consumer, [
                {
                    inputFilePath: '/a/index.ts',
                    content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
                }
            ]);
            const producerInput = inputFor(producer, [
                {
                    inputFilePath: '/b/helpers.ts',
                    content: 'export function used() { return 1; }\nexport function unused() { return 2; }'
                }
            ]);
            const seeds = buildCrossBundleSeeds([ consumerInput, producerInput ]);
            const bSeeds = seeds.get('pkg-b');
            assertDefined(bSeeds);
            assert.ok(bSeeds.has(bindingId('helpers.ts', 'used')));
            assert.strictEqual(bSeeds.has(bindingId('helpers.ts', 'unused')), false);
            assert.strictEqual(bSeeds.has(bindingId('helpers.ts', 'default')), false);
        });

        test('records a default import as a "default" binding seed', function () {
            const consumer = bundleWith('pkg-a', [
                {
                    inputFilePath: '/a/index.ts',
                    targetFilePath: 'index.ts',
                    content: 'import dep from "pkg-b/main.ts";\nexport function pub() { return dep; }'
                }
            ]);
            const producer = bundleWith('pkg-b', [
                {
                    inputFilePath: '/b/main.ts',
                    targetFilePath: 'main.ts',
                    content: 'export default 42;'
                }
            ]);
            const seeds = buildCrossBundleSeeds([
                inputFor(consumer, [
                    {
                        inputFilePath: '/a/index.ts',
                        content: 'import dep from "pkg-b/main.ts";\nexport function pub() { return dep; }'
                    }
                ]),
                inputFor(producer, [ { inputFilePath: '/b/main.ts', content: 'export default 42;' } ])
            ]);
            const bSeeds = seeds.get('pkg-b');
            assertDefined(bSeeds);
            assert.ok(bSeeds.has(bindingId('main.ts', 'default')));
        });

        test('records a named re-export as a seed in the target bundle', function () {
            const bSeeds = seedsForConsumerProducer(
                'export { used } from "pkg-b/helpers.ts";',
                'export function used() { return 1; }\nexport function unused() { return 2; }'
            );
            assertDefined(bSeeds);
            assert.ok(bSeeds.has(bindingId('helpers.ts', 'used')));
            assert.strictEqual(bSeeds.has(bindingId('helpers.ts', 'unused')), false);
        });

        test('records every binding of the target file as a seed for a star re-export', function () {
            assertHelpersBindingsSeeded(
                seedsForConsumerProducer(
                    'export * from "pkg-b/helpers.ts";',
                    'export const a = 1;\nexport const b = 2;'
                )
            );
        });

        test('records every binding of the target file as a seed for a namespace re-export', function () {
            assertHelpersBindingsSeeded(
                seedsForConsumerProducer(
                    'export * as helpers from "pkg-b/helpers.ts";',
                    'export const a = 1;\nexport const b = 2;'
                )
            );
        });

        test('ignores a bare local re-export with no module specifier', function () {
            const seeds = seedsForLoneConsumer('function local() { return 1; }\nexport { local };');
            assert.strictEqual(seeds.size, 0);
        });
    });

    suite('namespace and unmatched imports', function () {
        test('does not record a re-export seed when the specifier does not match any bundle name', function () {
            const seeds = seedsForLoneConsumer('export { x } from "external-pkg";');
            assert.strictEqual(seeds.size, 0);
        });

        test('records every binding of the target file as a seed for a namespace import', function () {
            assertHelpersBindingsSeeded(
                seedsForConsumerProducer(
                    'import * as helpers from "pkg-b/helpers.ts";\nexport function pub() { return helpers; }',
                    'export const a = 1;\nexport const b = 2;'
                )
            );
        });

        test('does not record a seed when the specifier matches a bundle name but not any file in that bundle', function () {
            const consumer = bundleWith('pkg-a', [
                {
                    inputFilePath: '/a/index.ts',
                    targetFilePath: 'index.ts',
                    content: 'import { used } from "pkg-b/missing.ts";\nexport function pub() { return used(); }'
                }
            ]);
            const producer = bundleWith('pkg-b', [
                {
                    inputFilePath: '/b/helpers.ts',
                    targetFilePath: 'helpers.ts',
                    content: 'export function used() { return 1; }'
                }
            ]);
            const seeds = buildCrossBundleSeeds([
                inputFor(consumer, [
                    {
                        inputFilePath: '/a/index.ts',
                        content: 'import { used } from "pkg-b/missing.ts";\nexport function pub() { return used(); }'
                    }
                ]),
                inputFor(producer, [ {
                    inputFilePath: '/b/helpers.ts',
                    content: 'export function used() { return 1; }'
                } ])
            ]);
            assert.strictEqual(seeds.size, 0);
        });

        test('does not record seeds for a namespace import that targets a file with no extracted bindings', function () {
            const consumer = bundleWith('pkg-a', [
                {
                    inputFilePath: '/a/index.ts',
                    targetFilePath: 'index.ts',
                    content: 'import * as data from "pkg-b/data.json";\nexport function pub() { return data; }'
                }
            ]);
            const producer = bundleWith('pkg-b', [
                {
                    inputFilePath: '/b/data.json',
                    targetFilePath: 'data.json',
                    content: '{}'
                }
            ]);
            const seeds = buildCrossBundleSeeds([
                inputFor(consumer, [
                    {
                        inputFilePath: '/a/index.ts',
                        content: 'import * as data from "pkg-b/data.json";\nexport function pub() { return data; }'
                    }
                ]),
                { bundle: producer, fileBindings: [], localReachable: new Set<string>() }
            ]);
            assert.strictEqual(seeds.size, 0);
        });

        test('records seeds only in the bundle whose name prefixes the specifier, not in other bundles that share a target file path', function () {
            const consumer = bundleWith('pkg-a', [
                {
                    inputFilePath: '/a/index.ts',
                    targetFilePath: 'index.ts',
                    content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
                },
                {
                    inputFilePath: '/a/helpers.ts',
                    targetFilePath: 'helpers.ts',
                    content: 'export function used() { return 0; }'
                }
            ]);
            const producer = bundleWith('pkg-b', [
                {
                    inputFilePath: '/b/helpers.ts',
                    targetFilePath: 'helpers.ts',
                    content: 'export function used() { return 1; }'
                }
            ]);
            const seeds = buildCrossBundleSeeds([
                inputFor(consumer, [
                    {
                        inputFilePath: '/a/index.ts',
                        content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
                    },
                    { inputFilePath: '/a/helpers.ts', content: 'export function used() { return 0; }' }
                ]),
                inputFor(producer, [ {
                    inputFilePath: '/b/helpers.ts',
                    content: 'export function used() { return 1; }'
                } ])
            ]);
            assert.strictEqual(seeds.has('pkg-a'), false);
            const bSeeds = seeds.get('pkg-b');
            assertDefined(bSeeds);
            assert.ok(bSeeds.has(bindingId('helpers.ts', 'used')));
        });

        test('does not seed a named import whose local binding is only referenced by unreachable code', function () {
            const bSeeds = seedsForConsumerProducer(
                'import { used } from "pkg-b/helpers.ts";\nfunction dead() { return used(); }\nexport function pub() { return 1; }',
                'export function used() { return 1; }'
            );
            assert.strictEqual(bSeeds, undefined);
        });

        test('does not seed a default import whose local binding is only referenced by unreachable code', function () {
            const bSeeds = seedsForConsumerProducer(
                'import dep from "pkg-b/helpers.ts";\nfunction dead() { return dep; }\nexport function pub() { return 1; }',
                'export default 42;'
            );
            assert.strictEqual(bSeeds, undefined);
        });

        test('does not seed a namespace import whose local binding is only referenced by unreachable code', function () {
            const bSeeds = seedsForConsumerProducer(
                'import * as helpers from "pkg-b/helpers.ts";\nfunction dead() { return helpers; }\nexport function pub() { return 1; }',
                'export const a = 1;\nexport const b = 2;'
            );
            assert.strictEqual(bSeeds, undefined);
        });
    });

    suite('reachable aliased imports', function () {
        test('uses the aliased local name to gate seeding for renamed named imports', function () {
            const bSeeds = seedsForConsumerProducer(
                'import { used as renamed } from "pkg-b/helpers.ts";\nexport function pub() { return renamed(); }',
                'export function used() { return 1; }'
            );
            assertDefined(bSeeds);
            assert.ok(bSeeds.has(bindingId('helpers.ts', 'used')));
        });

        test('does not seed a renamed named import whose aliased local binding is unreachable', function () {
            const bSeeds = seedsForConsumerProducer(
                'import { used as renamed } from "pkg-b/helpers.ts";\nfunction dead() { return renamed(); }\nexport function pub() { return 1; }',
                'export function used() { return 1; }'
            );
            assert.strictEqual(bSeeds, undefined);
        });

        test('seeds only the named imports whose local bindings are referenced by reachable code', function () {
            const bSeeds = seedsForConsumerProducer(
                [
                    'import { used, alsoDead } from "pkg-b/helpers.ts";',
                    'function dead() { return alsoDead(); }',
                    'export function pub() { return used(); }'
                ]
                    .join('\n'),
                'export function used() { return 1; }\nexport function alsoDead() { return 2; }'
            );
            assertDefined(bSeeds);
            assert.ok(bSeeds.has(bindingId('helpers.ts', 'used')));
            assert.strictEqual(bSeeds.has(bindingId('helpers.ts', 'alsoDead')), false);
        });

        test('does not record a seed for an import that does not match any bundle name', function () {
            const consumer = bundleWith('pkg-a', [
                {
                    inputFilePath: '/a/index.ts',
                    targetFilePath: 'index.ts',
                    content: 'import { x } from "external-pkg";\nexport function pub() { return x; }'
                }
            ]);
            const seeds = buildCrossBundleSeeds([
                inputFor(consumer, [
                    {
                        inputFilePath: '/a/index.ts',
                        content: 'import { x } from "external-pkg";\nexport function pub() { return x; }'
                    }
                ])
            ]);
            assert.strictEqual(seeds.size, 0);
        });
    });
});
