import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createDeadCodeEliminationTraceCollector } from '../../test-libraries/dead-code-elimination-trace-fixtures.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createReachabilityTrace } from './reachability-trace.ts';

suite('reachability trace', function () {
    test('does not translate internal graph edges into binding observations', function () {
        const trace = createDeadCodeEliminationTraceCollector();
        const observer = createReachabilityTrace({ bundleName: 'example', trace: { collector: trace.collector } }, {
            visitedHas(visited, value) {
                return visited.has(value);
            },
            neighborAdded() {
                assert.fail('Internal edges must not notify binding consumers');
            }
        }, {
            nodes: new Map([ [ 'virtual', function () {
                return [];
            } ] ]),
            bindingDependencies() {
                return assert.fail('Internal edges must not resolve binding traces');
            }
        }, new Set());
        assertDefined(observer.neighborAdded);
        observer.neighborAdded('virtual', 'binding');
        assert.deepStrictEqual(trace.events, []);
    });

    test('records each newly reached binding once and preserves seeded bindings', function () {
        const trace = createDeadCodeEliminationTraceCollector();
        const observed: string[] = [];
        const observer = createReachabilityTrace({ bundleName: 'example', trace: { collector: trace.collector } }, {
            visitedHas(visited, value) {
                return visited.has(value);
            },
            neighborAdded(from, to) {
                observed.push(`${from}:${to}`);
            }
        }, {
            nodes: new Map(),
            bindingDependencies() {
                return [ 'seed', 'target' ];
            }
        }, new Set([ 'seed' ]));
        assertDefined(observer.neighborAdded);
        observer.neighborAdded('source', 'virtual');
        observer.neighborAdded('source', 'virtual');
        assert.deepStrictEqual(observed, [ 'source:target' ]);
        assert.deepStrictEqual(trace.events, [ {
            type: 'edge-added',
            bundleName: 'example',
            fromBindingIdentifier: 'source',
            toBindingIdentifier: 'target',
            reason: 'identifier-reference'
        } ]);
        assert.strictEqual(observer.visitedHas(new Set([ 'source' ]), 'source'), true);
        assert.strictEqual(observer.visitedHas(new Set(), 'source'), false);
    });
});
