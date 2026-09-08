import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import {
    createDeadCodeEliminationTraceCollector,
    formatDeadCodeEliminationTrace,
    type CollectedDeadCodeEliminationTrace
} from '../test-libraries/dead-code-elimination-trace-fixtures.ts';
import {
    createTestEliminator,
    createTracedTestEliminator
} from '../test-libraries/eliminator-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { bindingId } from './reachability/binding-id.ts';

type DeadCodeEliminationTraceEvent = CollectedDeadCodeEliminationTrace['events'][number];

function resource(
    inputFilePath: string,
    content: string,
    targetFilePath: string,
    directDependencies: ReadonlySet<string>
): LinkedBundleResource {
    return {
        ...bundleResource(inputFilePath, { content, directDependencies, targetFilePath }),
        isSubstituted: false
    };
}

function traceTestBundle(): LinkedBundle {
    return linkedBundle({
        name: 'pkg',
        contents: [
            resource(
                '/src/index.js',
                [
                    'import { used, deadImport } from "./dep.js";',
                    'const local = used;',
                    'const removed = 2;',
                    'export const api = local;',
                    ''
                ]
                    .join('\n'),
                'index.js',
                new Set([ 'dep.js' ])
            ),
            resource(
                '/src/dep.js',
                'export const used = 1;\nexport const deadImport = 2;\n',
                'dep.js',
                new Set<string>()
            ),
            resource('/src/dead.js', 'export const dead = 1;\n', 'dead.js', new Set<string>()),
            resource('/src/dead.js.map', '{"version":3,"mappings":""}', 'dead.js.map', new Set<string>())
        ],
        roots: {
            main: {
                js: {
                    content: '',
                    isExecutable: false,
                    inputFilePath: '/src/index.js',
                    targetFilePath: 'index.js'
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

function hasEvent(
    events: readonly DeadCodeEliminationTraceEvent[],
    predicate: (event: DeadCodeEliminationTraceEvent) => boolean
): boolean {
    return events.some(predicate);
}

function eventCount(
    events: readonly DeadCodeEliminationTraceEvent[],
    predicate: (event: DeadCodeEliminationTraceEvent) => boolean
): number {
    return events.filter(predicate).length;
}

async function tracedEventsFor(...bundles: readonly LinkedBundle[]): Promise<readonly DeadCodeEliminationTraceEvent[]> {
    const trace = createDeadCodeEliminationTraceCollector();
    await createTracedTestEliminator(trace.collector).eliminate(inputs(...bundles));
    return trace.events;
}

function importRepairBundle(content: string, targetFilePath: string): LinkedBundle {
    return bundleForCodeFile({
        name: 'pkg',
        inputFilePath: `/src/${targetFilePath}`,
        targetFilePath,
        content
    });
}

function tracedConsumerProducerBundles(
    consumerContent: string,
    producerContent: string
): readonly [LinkedBundle, LinkedBundle] {
    return [
        bundleForCodeFile({
            name: 'consumer',
            inputFilePath: '/consumer/index.js',
            targetFilePath: 'index.js',
            content: consumerContent
        }),
        bundleForCodeFile({
            name: 'producer',
            inputFilePath: '/producer/index.js',
            targetFilePath: 'index.js',
            content: producerContent
        })
    ];
}

suite('dead code elimination trace', function () {
    test('createTestEliminator records no trace events', async function () {
        const trace = createDeadCodeEliminationTraceCollector();

        await createTestEliminator().eliminate(inputs(traceTestBundle()));

        assert.deepStrictEqual(trace.events, []);
    });

    test('createTracedTestEliminator records local seeds, edges, removals, repairs, and pruned files', async function () {
        const trace = createDeadCodeEliminationTraceCollector();

        await createTracedTestEliminator(trace.collector).eliminate(inputs(traceTestBundle()));

        assert.strictEqual(
            hasEvent(trace.events, function (event) {
                return event.type === 'local-seed-added' &&
                    event.bundleName === 'pkg' &&
                    event.bindingId === bindingId('index.js', 'api') &&
                    event.reason === 'entry-export' &&
                    event.line === 4;
            }),
            true
        );
        assert.strictEqual(
            hasEvent(trace.events, function (event) {
                return event.type === 'edge-added' &&
                    event.bundleName === 'pkg' &&
                    event.fromBindingId === bindingId('index.js', 'api') &&
                    event.toBindingId === bindingId('index.js', 'local');
            }),
            true
        );
        assert.match(formatDeadCodeEliminationTrace(trace.events), /identifier-reference/u);
        assert.strictEqual(
            hasEvent(trace.events, function (event) {
                return event.type === 'binding-removed' &&
                    event.bundleName === 'pkg' &&
                    event.bindingId === bindingId('index.js', 'removed');
            }),
            true
        );
        assert.strictEqual(
            hasEvent(trace.events, function (event) {
                return event.type === 'import-repaired' &&
                    event.bundleName === 'pkg' &&
                    event.moduleSpecifier === './dep.js' &&
                    event.repairKind === 'binding-dropped' &&
                    event.bindingName === 'deadImport';
            }),
            true
        );
        assert.strictEqual(
            hasEvent(trace.events, function (event) {
                return event.type === 'file-pruned' &&
                    event.bundleName === 'pkg' &&
                    event.targetFilePath === 'dead.js' &&
                    event.pruneKind === 'unreachable-resource';
            }),
            true
        );
        assert.strictEqual(
            hasEvent(trace.events, function (event) {
                return event.type === 'file-pruned' &&
                    event.bundleName === 'pkg' &&
                    event.targetFilePath === 'dead.js.map' &&
                    event.pruneKind === 'paired-map-of-pruned-resource';
            }),
            true
        );
    });

    test('createTracedTestEliminator records declaration and impure statement seed reasons', async function () {
        const bundle = linkedBundle({
            name: 'pkg',
            contents: [
                resource(
                    '/src/index.js',
                    'export { used } from "./dep.js";\nconst side = 1;\nconsole.log(side);\n',
                    'index.js',
                    new Set([ 'dep.js' ])
                ),
                resource('/src/dep.js', 'export const used = 1;\n', 'dep.js', new Set<string>())
            ],
            roots: {
                main: {
                    js: {
                        content: '',
                        isExecutable: false,
                        inputFilePath: '/src/index.js',
                        targetFilePath: 'index.js'
                    }
                }
            },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' }
        });
        const events = await tracedEventsFor(bundle);

        assert.strictEqual(
            hasEvent(events, function (event) {
                return event.type === 'local-seed-added' &&
                    event.reason === 'entry-export-declaration' &&
                    event.bindingId === bindingId('dep.js', 'used');
            }),
            true
        );
        assert.strictEqual(
            hasEvent(events, function (event) {
                return event.type === 'local-seed-added' &&
                    event.reason === 'impure-statement' &&
                    event.bindingId === bindingId('index.js', 'side');
            }),
            true
        );
    });

    test('createTracedTestEliminator records import repair kinds', async function () {
        const runtimeEvents = await tracedEventsFor(
            importRepairBundle('import dead from "./side.js";\nexport const api = 1;\n', 'index.js')
        );
        const typeOnlyEvents = await tracedEventsFor(
            importRepairBundle('import type { Dead } from "./types.js";\nexport const api = 1;\n', 'index.ts')
        );
        const declarationEvents = await tracedEventsFor(
            importRepairBundle('import { Dead } from "./types.js";\nexport interface Api {}\n', 'index.d.ts')
        );

        assert.strictEqual(
            hasEvent(runtimeEvents, function (event) {
                return event.type === 'import-repaired' && event.repairKind === 'converted-to-bare';
            }),
            true
        );
        assert.strictEqual(
            hasEvent(typeOnlyEvents, function (event) {
                return event.type === 'import-repaired' && event.repairKind === 'removed-type-only';
            }),
            true
        );
        assert.strictEqual(
            hasEvent(declarationEvents, function (event) {
                return event.type === 'import-repaired' && event.repairKind === 'removed-declaration-file-import';
            }),
            true
        );
    });

    test('createTracedTestEliminator records cross-bundle seed reasons', async function () {
        const namedImportEvents = await tracedEventsFor(
            ...tracedConsumerProducerBundles(
                'import { shared } from "producer";\nexport const api = shared;\n',
                'export const shared = 1;\nexport const unused = 2;\n'
            )
        );
        const defaultImportEvents = await tracedEventsFor(
            ...tracedConsumerProducerBundles(
                'import shared from "producer";\nexport const api = shared;\n',
                'export default 1;\n'
            )
        );
        const namespaceImportEvents = await tracedEventsFor(
            ...tracedConsumerProducerBundles(
                'import * as producer from "producer";\nexport const api = producer.shared;\n',
                'export const shared = 1;\n'
            )
        );
        const namedReExportEvents = await tracedEventsFor(
            ...tracedConsumerProducerBundles(
                'export { shared } from "producer";\n',
                'export const shared = 1;\n'
            )
        );
        const namespaceReExportEvents = await tracedEventsFor(
            ...tracedConsumerProducerBundles(
                'export * from "producer";\n',
                'export const shared = 1;\n'
            )
        );

        assert.strictEqual(
            hasEvent(namedImportEvents, function (event) {
                return event.type === 'cross-bundle-seed-added' &&
                    event.bundleName === 'producer' &&
                    event.bindingId === bindingId('index.js', 'shared') &&
                    event.sourceBundleName === 'consumer' &&
                    event.moduleSpecifier === 'producer' &&
                    event.reason === 'named-import';
            }),
            true
        );
        assert.strictEqual(
            hasEvent(defaultImportEvents, function (event) {
                return event.type === 'cross-bundle-seed-added' && event.reason === 'default-import';
            }),
            true
        );
        assert.strictEqual(
            hasEvent(namespaceImportEvents, function (event) {
                return event.type === 'cross-bundle-seed-added' && event.reason === 'namespace-import';
            }),
            true
        );
        assert.strictEqual(
            hasEvent(namedReExportEvents, function (event) {
                return event.type === 'cross-bundle-seed-added' && event.reason === 'named-reexport';
            }),
            true
        );
        assert.strictEqual(
            hasEvent(namespaceReExportEvents, function (event) {
                return event.type === 'cross-bundle-seed-added' && event.reason === 'namespace-reexport';
            }),
            true
        );
    });

    test('createTracedTestEliminator records one cross-bundle event per added seed', async function () {
        const events = await tracedEventsFor(
            ...tracedConsumerProducerBundles(
                [
                    'import { shared } from "producer";',
                    'import { shared as again } from "producer";',
                    'export const api = [ shared, again ];',
                    ''
                ]
                    .join('\n'),
                'export const shared = 1;\n'
            )
        );

        assert.strictEqual(
            eventCount(events, function (event) {
                return event.type === 'cross-bundle-seed-added' &&
                    event.bindingId === bindingId('index.js', 'shared');
            }),
            1
        );
    });
});
