import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    deadCodeEliminationSettingsSchema,
    resolveDeadCodeEliminationSettings
} from './dead-code-elimination-settings.ts';

suite('dead-code-elimination-settings', function () {
    test('resolveDeadCodeEliminationSettings() returns undefined when neither package nor common settings are present', function () {
        assert.strictEqual(resolveDeadCodeEliminationSettings(undefined, undefined), undefined);
    });

    test('resolveDeadCodeEliminationSettings() defaults enabled to true when settings exist but do not set it', function () {
        const packageSettings = {
            pureImports: [ { from: 'builder-library' } ]
        } as unknown as Parameters<typeof resolveDeadCodeEliminationSettings>[0];

        assert.deepStrictEqual(resolveDeadCodeEliminationSettings(packageSettings, undefined), {
            enabled: true,
            pureImports: [ { from: 'builder-library' } ]
        });
    });

    test('resolveDeadCodeEliminationSettings() prefers package settings over common settings', function () {
        assert.deepStrictEqual(
            resolveDeadCodeEliminationSettings(
                { enabled: false, pureImports: [ { from: 'builder-library' } ] },
                { enabled: true, pureImports: [ { from: 'formatting-library' } ] }
            ),
            {
                enabled: false,
                pureImports: [ { from: 'builder-library' } ]
            }
        );
    });

    test('inherits disabled common settings and trust lists without package overrides', function () {
        assert.deepStrictEqual(
            resolveDeadCodeEliminationSettings(undefined, {
                enabled: false,
                pureImports: [ { from: 'builder-library', imports: [ 'build' ] } ]
            }),
            {
                enabled: false,
                pureImports: [ { from: 'builder-library', imports: [ 'build' ] } ]
            }
        );
    });

    test('deadCodeEliminationSettingsSchema accepts the documented enabled/pureImports shape', function () {
        const result = deadCodeEliminationSettingsSchema.safeParse({
            enabled: true,
            pureImports: [ { from: 'builder-library', imports: [ 'builder' ] } ]
        });
        assert.strictEqual(result.success, true);
    });

    test('deadCodeEliminationSettingsSchema rejects an unknown top-level field in strict mode', function () {
        const result = deadCodeEliminationSettingsSchema.safeParse({ enabled: true, unknown: 1 });
        assert.strictEqual(result.success, false);
    });

    test('deadCodeEliminationSettingsSchema rejects a pureImports entry missing the required from field', function () {
        const result = deadCodeEliminationSettingsSchema.safeParse({ enabled: true, pureImports: [ {} ] });
        assert.strictEqual(result.success, false);
    });
});
