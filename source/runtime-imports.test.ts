import assert from 'node:assert';
import { suite, test } from 'mocha';

suite('runtime-imports', function () {
    test('loads runtime modules that currently only export type shapes', async function () {
        await Promise.all([
            import('./checks/rule.ts'),
            import('./file-manager/file-description.ts'),
            import('./linker/linked-bundle.ts'),
            import('./resource-resolver/resolved-bundle.ts'),
            import('./resource-resolver/resource-resolve-options.ts')
        ]);

        assert.ok(true);
    });
});
