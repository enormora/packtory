import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import {
    buildResultFor,
    createReleaseTestDependencies,
    packageProcessorWithFailure,
    resolvedPackagesFor,
    validatedReleaseConfigurationFor
} from '../test-libraries/release-orchestrator-fixtures.ts';
import { prepareRelease } from './prepared-release.ts';
import { createScheduler } from './scheduler.ts';

suite('prepared release', function () {
    test('emits public completion events when release packages have been prepared', async function () {
        const broadcaster = createProgressBroadcaster();
        const completed: string[] = [];
        broadcaster.consumer.on('done', function (event) {
            completed.push(event.packageName);
        });
        const dependencies = {
            ...createReleaseTestDependencies({
                packageNames: [ 'package-a' ],
                buildResults: [ buildResultFor({ packageName: 'package-a' }) ]
            }),
            progressBroadcaster: broadcaster,
            scheduler: createScheduler({ progressBroadcastProvider: broadcaster.provider })
        };
        const prepared = await prepareRelease(
            dependencies,
            validatedReleaseConfigurationFor([ 'package-a' ]),
            async function (configuration) {
                return Result.ok(resolvedPackagesFor(configuration));
            }
        );
        assert.strictEqual(prepared.isOk, true);
        assert.deepStrictEqual(completed, [ 'package-a' ]);
    });

    test('projects prepared packages in order and keeps successful projections when another fails', async function () {
        const names = [ 'package-a', 'package-b', 'package-c' ];
        const dependencies = createReleaseTestDependencies({
            packageNames: names,
            buildResults: names.map(function (packageName) {
                return buildResultFor({ packageName });
            })
        });
        const prepared = await prepareRelease(
            dependencies,
            validatedReleaseConfigurationFor(names),
            async function (configuration) {
                return Result.ok(resolvedPackagesFor(configuration));
            }
        );
        if (prepared.isErr) {
            assert.fail('expected preparation to succeed');
        }
        const failure = new Error('cannot project package-b');
        const visited: string[] = [];
        const projection = await prepared.value.project(async function (entry) {
            visited.push(entry.bundle.name);
            if (entry.bundle.name === 'package-b') {
                throw failure;
            }
            await Promise.resolve();
            return entry.bundle.name;
        });
        assert.deepStrictEqual(visited, names);
        assert.deepStrictEqual(
            projection,
            Result.err({
                type: 'partial',
                succeeded: [ 'package-a', 'package-c' ],
                failures: [ failure ]
            })
        );
    });

    test('preparation failures take precedence while successful package projections remain available', async function () {
        const names = [ 'package-a', 'package-b' ];
        const failure = new Error('cannot prepare package-b');
        const dependencies = createReleaseTestDependencies({
            packageNames: names,
            packageProcessor: packageProcessorWithFailure([ buildResultFor({ packageName: 'package-a' }) ], failure)
        });
        const prepared = await prepareRelease(
            dependencies,
            validatedReleaseConfigurationFor(names),
            async function (configuration) {
                return Result.ok(resolvedPackagesFor(configuration));
            }
        );
        if (prepared.isErr) {
            assert.fail('expected a prepared release containing the partial result');
        }
        const result = await prepared.value.project(function (entry) {
            return entry.bundle.name;
        });
        assert.deepStrictEqual(
            result,
            Result.err({ type: 'partial', succeeded: [ 'package-a' ], failures: [ failure ] })
        );
    });

    test('does not expose resolved packages as prepared successes after partial resolution failure', async function () {
        const failure = new Error('cannot resolve package-b');
        const dependencies = createReleaseTestDependencies({ packageNames: [ 'package-a', 'package-b' ] });
        const prepared = await prepareRelease(
            dependencies,
            validatedReleaseConfigurationFor([ 'package-a', 'package-b' ]),
            async function (configuration) {
                return Result.err({
                    type: 'partial',
                    error: { succeeded: resolvedPackagesFor(configuration).slice(0, 1), failures: [ failure ] }
                });
            }
        );
        assert.deepStrictEqual(prepared, Result.err({ type: 'partial', succeeded: [], failures: [ failure ] }));
    });
});
