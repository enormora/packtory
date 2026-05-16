import assert from 'node:assert';
import { test } from 'mocha';
import { resolveDeadCodeEliminationSettings } from './dead-code-elimination-settings.ts';

test('resolveDeadCodeEliminationSettings() returns undefined when neither package nor common settings are present', () => {
    assert.strictEqual(resolveDeadCodeEliminationSettings(undefined, undefined), undefined);
});

test('resolveDeadCodeEliminationSettings() defaults enabled to true when settings exist but do not set it', () => {
    const packageSettings = {
        pureImports: [{ from: 'zod/mini' }],
        pureConstructors: ['Set']
    } as unknown as Parameters<typeof resolveDeadCodeEliminationSettings>[0];

    assert.deepStrictEqual(resolveDeadCodeEliminationSettings(packageSettings, undefined), {
        enabled: true,
        pureImports: [{ from: 'zod/mini' }],
        pureConstructors: ['Set']
    });
});

test('resolveDeadCodeEliminationSettings() prefers package settings over common settings', () => {
    assert.deepStrictEqual(
        resolveDeadCodeEliminationSettings(
            { enabled: false, pureConstructors: ['Map'] },
            { enabled: true, pureImports: [{ from: 'yoctocolors' }], pureConstructors: ['Set'] }
        ),
        {
            enabled: false,
            pureImports: [{ from: 'yoctocolors' }],
            pureConstructors: ['Map']
        }
    );
});
