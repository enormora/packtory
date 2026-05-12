import assert from 'node:assert';
import { test } from 'mocha';
import { createProgressBroadcaster } from './progress-broadcaster.ts';

test('emits events to registered listeners', () => {
    const broadcaster = createProgressBroadcaster();
    const receivedPayloads: unknown[] = [];

    broadcaster.consumer.on('scheduled', (payload) => {
        receivedPayloads.push(payload);
    });

    broadcaster.provider.emit('scheduled', { packageName: 'package-a' });

    assert.deepStrictEqual(receivedPayloads, [{ packageName: 'package-a' }]);
});

test('off() removes a registered listener', () => {
    const broadcaster = createProgressBroadcaster();
    const receivedPayloads: unknown[] = [];
    const listener = (payload: { packageName: string }): void => {
        receivedPayloads.push(payload);
    };

    broadcaster.consumer.on('scheduled', listener);
    broadcaster.consumer.off('scheduled', listener);
    broadcaster.provider.emit('scheduled', { packageName: 'package-a' });

    assert.deepStrictEqual(receivedPayloads, []);
});

test('hasSubscribers() returns false when no listener is registered', () => {
    const broadcaster = createProgressBroadcaster();

    assert.strictEqual(broadcaster.provider.hasSubscribers('eliminationCompleted'), false);
});

const noop = (): void => {
    return undefined;
};

test('hasSubscribers() returns true after a listener is registered', () => {
    const broadcaster = createProgressBroadcaster();

    broadcaster.consumer.on('eliminationCompleted', noop);

    assert.strictEqual(broadcaster.provider.hasSubscribers('eliminationCompleted'), true);
});

test('hasSubscribers() returns false after the last listener is removed', () => {
    const broadcaster = createProgressBroadcaster();

    broadcaster.consumer.on('eliminationCompleted', noop);
    broadcaster.consumer.off('eliminationCompleted', noop);

    assert.strictEqual(broadcaster.provider.hasSubscribers('eliminationCompleted'), false);
});

test('hasSubscribers() is per-event-name', () => {
    const broadcaster = createProgressBroadcaster();

    broadcaster.consumer.on('scanCompleted', noop);

    assert.strictEqual(broadcaster.provider.hasSubscribers('scanCompleted'), true);
    assert.strictEqual(broadcaster.provider.hasSubscribers('linkingCompleted'), false);
});

test('decision events with no subscribers emit without error', () => {
    const broadcaster = createProgressBroadcaster();

    broadcaster.provider.emit('versionDetermined', {
        packageName: 'package-a',
        previousVersion: '1.0.0',
        chosenVersion: '1.0.1',
        trigger: 'auto-patch-bump'
    });
});

test('round-trips an eliminationCompleted decision event', () => {
    const broadcaster = createProgressBroadcaster();
    const receivedPayloads: unknown[] = [];

    broadcaster.consumer.on('eliminationCompleted', (payload) => {
        receivedPayloads.push(payload);
    });

    broadcaster.provider.emit('eliminationCompleted', {
        perBundle: [
            {
                packageName: 'package-a',
                files: [{ path: 'src/index.ts', decision: 'kept', reason: 'reachable', sourceBytes: 42 }],
                droppedSymbols: [
                    { file: 'src/index.ts', symbolName: 'unused', kind: 'function', reason: 'unreachable' }
                ],
                seeds: []
            }
        ]
    });

    assert.deepStrictEqual(receivedPayloads, [
        {
            perBundle: [
                {
                    packageName: 'package-a',
                    files: [{ path: 'src/index.ts', decision: 'kept', reason: 'reachable', sourceBytes: 42 }],
                    droppedSymbols: [
                        { file: 'src/index.ts', symbolName: 'unused', kind: 'function', reason: 'unreachable' }
                    ],
                    seeds: []
                }
            ]
        }
    ]);
});
