import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { mapResolveFailureToPublishFailure } from './publish-failure-mapping.ts';

suite('publish-failure-mapping', function () {
    test('mapResolveFailureToPublishFailure passes config failures through unchanged', function () {
        const failure = { type: 'configuration', issues: [ 'bad' ] } as const;
        assert.strictEqual(mapResolveFailureToPublishFailure(failure, createProgressBroadcaster().provider), failure);
    });

    test('mapResolveFailureToPublishFailure passes check failures through unchanged', function () {
        const failure = { type: 'checks', issues: [ 'rule' ] } as const;
        assert.strictEqual(mapResolveFailureToPublishFailure(failure, createProgressBroadcaster().provider), failure);
    });

    test('marks resolved packages as skipped when publication is prevented by a resolution failure', function () {
        const broadcaster = createProgressBroadcaster();
        const events: unknown[] = [];
        broadcaster.consumer.on('skipped', function (entry) {
            events.push(entry);
        });
        const previouslySkipped = { packageName: 'dependent', reason: 'An earlier dependency generation failed' };
        const failures = [ new Error('resolution failed') ];

        const mapped = mapResolveFailureToPublishFailure({
            type: 'partial',
            error: { succeeded: [ { name: 'prepared' } ] as never, failures, skipped: [ previouslySkipped ] }
        }, broadcaster.provider);

        const skipped = { packageName: 'prepared', reason: 'Publishing stopped because package resolution failed' };
        assert.deepStrictEqual(mapped, {
            type: 'partial',
            succeeded: [],
            failures,
            skipped: [ skipped, previouslySkipped ]
        });
        assert.deepStrictEqual(events, [ skipped ]);
    });

    test('mapResolveFailureToPublishFailure converts a partial resolve failure into a publish-partial failure with empty succeeded', function () {
        const failures = [ new Error('boom') ];
        const mapped = mapResolveFailureToPublishFailure(
            { type: 'partial', error: { skipped: [], succeeded: [], failures } },
            createProgressBroadcaster().provider
        );

        assert.deepStrictEqual(mapped, {
            skipped: [],
            type: 'partial',
            succeeded: [],
            failures
        });
    });
});
