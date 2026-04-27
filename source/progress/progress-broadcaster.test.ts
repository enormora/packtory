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
