import assert from 'node:assert';
import { test } from 'mocha';
import { inspectScanResults } from './inspect-scan-results.ts';

test('inspectScanResults returns included files with reason "reachable-from-entry"', () => {
    const bundle = {
        contents: [
            { fileDescription: { sourceFilePath: '/src/a.ts' } },
            { fileDescription: { sourceFilePath: '/src/b.ts' } }
        ],
        externalDependencies: new Map<string, unknown>()
    };

    const { included } = inspectScanResults(bundle);

    assert.deepStrictEqual(included, [
        { path: '/src/a.ts', reason: 'reachable-from-entry' },
        { path: '/src/b.ts', reason: 'reachable-from-entry' }
    ]);
});

test('inspectScanResults returns excluded specifiers with reason "external-module"', () => {
    const bundle = {
        contents: [],
        externalDependencies: new Map<string, unknown>([
            ['lodash', { version: '^4' }],
            ['react', { version: '^18' }]
        ])
    };

    const { excluded } = inspectScanResults(bundle);

    assert.deepStrictEqual(excluded, [
        { specifier: 'lodash', reason: 'external-module' },
        { specifier: 'react', reason: 'external-module' }
    ]);
});

test('inspectScanResults returns empty arrays when the bundle has no contents and no externals', () => {
    const { included, excluded } = inspectScanResults({
        contents: [],
        externalDependencies: new Map<string, unknown>()
    });

    assert.deepStrictEqual(included, []);
    assert.deepStrictEqual(excluded, []);
});
