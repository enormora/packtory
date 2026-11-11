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
    for (const field of [ 'maximumQueries', 'maximumEvaluations' ]) {
        for (const value of [ -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY ]) {
            test(`rejects ${field}=${value} before starting analysis`, function () {
                assert.throws(function () {
                    createNamespaceDemandSolver({ ...ordinaryLimits, [field]: value });
                }, {
                    name: 'RangeError',
                    message: 'Namespace demand limits must be nonnegative safe integers'
                });
            });
        }
    }

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
            const visits = new Set<string>();
            const solver = createNamespaceDemandSolver<string>(ordinaryLimits);
            const evaluations = {
                first(): NamespaceDemand {
                    assert.ok(!visits.has('first'));
                    visits.add('first');
                    return solver.read('second', evaluations.second);
                },
                second(): NamespaceDemand {
                    assert.ok(!visits.has('second'));
                    visits.add('second');
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
        test('keeps exhaustion sticky for already resolved queries and direct reads', function () {
            const solver = createNamespaceDemandSolver<string>({ maximumQueries: 1, maximumEvaluations: 8 });
            assert.strictEqual(
                solver.resolve('known', function () {
                    return firstObservation;
                }),
                firstObservation
            );
            assert.strictEqual(
                solver.read('overflow', function () {
                    assert.fail('query budget exhausted');
                }),
                allNamespaceProperties
            );
            assert.strictEqual(
                solver.read('known', function () {
                    return firstObservation;
                }),
                allNamespaceProperties
            );
            assert.strictEqual(
                solver.resolve('known', function () {
                    return firstObservation;
                }),
                allNamespaceProperties
            );
        });

        test('stops pending evaluations when a dependency exhausts the query budget', function () {
            const solver = createNamespaceDemandSolver<string>({ maximumQueries: 3, maximumEvaluations: 8 });
            const evaluations = {
                overflow(): NamespaceDemand {
                    assert.fail('query budget exhausted');
                },
                first(): NamespaceDemand {
                    solver.read('overflow', evaluations.overflow);
                    return firstObservation;
                },
                pending(): NamespaceDemand {
                    assert.fail('exhausted analysis cannot evaluate pending work');
                },
                outer(): NamespaceDemand {
                    solver.read('first', evaluations.first);
                    solver.read('pending', evaluations.pending);
                    return noNamespaceProperties;
                }
            };
            assert.strictEqual(solver.resolve('outer', evaluations.outer), allNamespaceProperties);
        });

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
            let evaluations = 0;
            const evaluate = function (): NamespaceDemand {
                evaluations += 1;
                assert.ok(evaluations <= 8);
                return namespaceMemberDemand('nested', solver.read('entry', evaluate));
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
            solver.read('entry', function () {
                return firstObservation;
            }),
            allNamespaceProperties
        );
        assert.strictEqual(
            solver.resolve('other', function () {
                return noNamespaceProperties;
            }),
            allNamespaceProperties
        );
    });
});
