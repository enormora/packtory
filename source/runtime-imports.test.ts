import assert from 'node:assert';
import { test } from 'mocha';

test('loads runtime modules that currently only export type shapes', async () => {
    await Promise.all([
        import('./checks/rule.ts'),
        import('./file-manager/file-description.ts'),
        import('./linker/linked-bundle.ts'),
        import('./resource-resolver/resolved-bundle.ts'),
        import('./resource-resolver/resource-resolve-options.ts')
    ]);

    assert.ok(true);
});
