import assert from 'node:assert';
import { test } from 'mocha';
import {
    deadCodeEliminationSettingsSchema,
    resolveDeadCodeEliminationSettings
} from './dead-code-elimination-settings.ts';

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

test('deadCodeEliminationSettingsSchema accepts the documented enabled/pureImports/pureConstructors shape', () => {
    const result = deadCodeEliminationSettingsSchema.safeParse({
        enabled: true,
        pureImports: [{ from: 'zod/mini', imports: ['z'] }],
        pureConstructors: ['Set']
    });
    assert.strictEqual(result.success, true);
});

test('deadCodeEliminationSettingsSchema rejects an unknown top-level field in strict mode', () => {
    const result = deadCodeEliminationSettingsSchema.safeParse({ enabled: true, unknown: 1 });
    assert.strictEqual(result.success, false);
});

test('deadCodeEliminationSettingsSchema rejects a pureImports entry missing the required from field', () => {
    const result = deadCodeEliminationSettingsSchema.safeParse({ enabled: true, pureImports: [{}] });
    assert.strictEqual(result.success, false);
});

test('deadCodeEliminationSettingsSchema rejects a pureConstructors entry that is an empty string', () => {
    const result = deadCodeEliminationSettingsSchema.safeParse({ enabled: true, pureConstructors: [''] });
    assert.strictEqual(result.success, false);
});
