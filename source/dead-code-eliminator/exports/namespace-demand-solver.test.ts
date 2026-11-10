import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    allNamespaceProperties,
    mergeNamespaceDemand,
    namespaceMemberDemand,
    namespaceProperties,
    noNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';
import { createNamespaceDemandSolver } from './namespace-demand-solver.ts';

const ordinaryLimits = { maximumQueries: 32, maximumEvaluations: 128 };
const firstObservation = namespaceMemberDemand('first', noNamespaceProperties);
const secondObservation = namespaceMemberDemand('second', noNamespaceProperties);

suite('namespace demand fixed points', function () {
    suite('dependencies', function () {
        test('evaluates a root and preserves its cached demand', function () {
            const solver = createNamespaceDemandSolver<string>(ordinaryLimits);
            const evaluate = function (): NamespaceDemand {
                return firstObservation;
            };
            assert.strictEqual(solver.read('entry', evaluate), noNamespaceProperties);
            assert.strictEqual(solver.resolve('entry', evaluate), firstObservation);
            assert.strictEqual(solver.read('entry', evaluate), firstObservation);
            assert.strictEqual(solver.resolve('entry', evaluate), firstObservation);
        });

        test('propagates observations around a cycle', function () {
            const solver = createNamespaceDemandSolver<string>(ordinaryLimits);
            const evaluations = {
                first(): NamespaceDemand {
                    return mergeNamespaceDemand(firstObservation, solver.read('second', evaluations.second));
                },
                second(): NamespaceDemand {
                    return mergeNamespaceDemand(secondObservation, solver.read('first', evaluations.first));
                }
            };
            assert.deepStrictEqual(
                namespaceProperties(solver.resolve('first', evaluations.first)),
                new Set([ 'first', 'second' ])
            );
            assert.deepStrictEqual(
                namespaceProperties(solver.resolve('second', evaluations.second)),
                new Set([ 'first', 'second' ])
            );
        });

        test('settles empty cycles without making all properties live', function () {
            const solver = createNamespaceDemandSolver<string>(ordinaryLimits);
            const evaluations = {
                first(): NamespaceDemand {
                    return solver.read('second', evaluations.second);
                },
                second(): NamespaceDemand {
                    return solver.read('first', evaluations.first);
                }
            };
            assert.strictEqual(solver.resolve('first', evaluations.first), noNamespaceProperties);
        });

        test('settles a self-dependent finite observation', function () {
            const solver = createNamespaceDemandSolver<string>(ordinaryLimits);
            const evaluate = function (): NamespaceDemand {
                return mergeNamespaceDemand(firstObservation, solver.read('entry', evaluate));
            };
            assert.deepStrictEqual(namespaceProperties(solver.resolve('entry', evaluate)), new Set([ 'first' ]));
        });

        test('discovers dependencies introduced by later observations', function () {
            const solver = createNamespaceDemandSolver<string>(ordinaryLimits);
            const evaluations = {
                first(): NamespaceDemand {
                    return firstObservation;
                },
                second(): NamespaceDemand {
                    return secondObservation;
                },
                gate(): NamespaceDemand {
                    return firstObservation;
                },
                entry(): NamespaceDemand {
                    const first = solver.read('first', evaluations.first);
                    const gate = solver.read('gate', evaluations.gate);
                    return gate === noNamespaceProperties
                        ? first
                        : mergeNamespaceDemand(first, solver.read('second', evaluations.second));
                }
            };
            assert.deepStrictEqual(
                namespaceProperties(solver.resolve('entry', evaluations.entry)),
                new Set([ 'first', 'second' ])
            );
        });

        test('preserves the outer dependency context across nested resolution', function () {
            const solver = createNamespaceDemandSolver<string>(ordinaryLimits);
            const evaluate = function (): NamespaceDemand {
                solver.resolve('inner', function () {
                    return noNamespaceProperties;
                });
                return solver.read('late', function () {
                    return firstObservation;
                });
            };
            assert.strictEqual(solver.resolve('entry', evaluate), firstObservation);
        });
    });

    suite('analysis limits', function () {
        test('allows a query at the exact query and evaluation limits', function () {
            const solver = createNamespaceDemandSolver<string>({ maximumQueries: 1, maximumEvaluations: 1 });
            const evaluate = function (): NamespaceDemand {
                return firstObservation;
            };
            assert.strictEqual(solver.resolve('entry', evaluate), firstObservation);
            assert.strictEqual(solver.resolve('entry', evaluate), firstObservation);
        });

        test('falls back globally when another query exceeds the limit', function () {
            const solver = createNamespaceDemandSolver<string>({ maximumQueries: 1, maximumEvaluations: 8 });
            const evaluate = function (): NamespaceDemand {
                return solver.read('dependency', function () {
                    return firstObservation;
                });
            };
            assert.strictEqual(solver.resolve('entry', evaluate), allNamespaceProperties);
            assert.strictEqual(solver.read('entry', evaluate), allNamespaceProperties);
            assert.strictEqual(
                solver.resolve('other', function () {
                    return noNamespaceProperties;
                }),
                allNamespaceProperties
            );
        });

        test('falls back globally when a cycle keeps extending a property path', function () {
            const solver = createNamespaceDemandSolver<string>({ maximumQueries: 1, maximumEvaluations: 8 });
            const evaluate = function (): NamespaceDemand {
                return namespaceMemberDemand('nested', solver.read('entry', evaluate));
            };
            assert.strictEqual(solver.resolve('entry', evaluate), allNamespaceProperties);
            assert.strictEqual(
                solver.resolve('other', function () {
                    return noNamespaceProperties;
                }),
                allNamespaceProperties
            );
        });

        for (
            const limits of [
                { maximumQueries: 0, maximumEvaluations: 1 },
                { maximumQueries: 1, maximumEvaluations: 0 }
            ]
        ) {
            test(`does not evaluate beyond limits ${JSON.stringify(limits)}`, function () {
                const solver = createNamespaceDemandSolver<string>(limits);
                assert.strictEqual(
                    solver.resolve('entry', function () {
                        assert.fail('The analysis budget does not allow this evaluation');
                    }),
                    allNamespaceProperties
                );
            });
        }
    });

    test('propagates an analysis exception and prevents reuse of incomplete facts', function () {
        const solver = createNamespaceDemandSolver<string>(ordinaryLimits);
        const failure = new Error('Failed analysis');
        let caught: unknown = null;
        try {
            solver.resolve('entry', function () {
                throw failure;
            });
        } catch (error) {
            caught = error;
        }
        assert.strictEqual(caught, failure);
        assert.strictEqual(
            solver.resolve('other', function () {
                return noNamespaceProperties;
            }),
            allNamespaceProperties
        );
    });
});
