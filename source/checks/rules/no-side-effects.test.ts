import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { PackageChecksSettings } from '../../config/config.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { noSideEffectsRule } from './no-side-effects.ts';

function impureResource(
    sourceFilePath: string,
    statements: readonly { readonly line: number; readonly kind: string }[]
): AnalyzedBundleResource {
    return analyzedBundleResource(sourceFilePath, {
        analysis: {
            sideEffectStatements: statements
        }
    });
}

function bundleWithImpureResources(name: string, resources: readonly AnalyzedBundleResource[]): AnalyzedBundle {
    return analyzedBundle({ name, contents: resources });
}

function consentMap(
    consenters: readonly (readonly [string, readonly string[]])[]
): ReadonlyMap<string, PackageChecksSettings> {
    return new Map(
        consenters.map(([name, allowList]) => {
            return [name, { noSideEffects: { allowList } }];
        })
    );
}

test('rule definition exposes name, schemas and a run function', () => {
    assert.strictEqual(noSideEffectsRule.name, 'noSideEffects');
    assert.strictEqual(typeof noSideEffectsRule.run, 'function');
    assert.notStrictEqual(noSideEffectsRule.globalSchema, undefined);
    assert.notStrictEqual(noSideEffectsRule.perPackageSchema, undefined);
});

test('returns no issues when settings are missing entirely', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [impureResource('/a.ts', [{ line: 1, kind: 'expression statement' }])])
        ],
        settings: undefined,
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('returns no issues when the rule is disabled at the top level', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [impureResource('/a.ts', [{ line: 1, kind: 'expression statement' }])])
        ],
        settings: { noSideEffects: { enabled: false } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('returns no issues when no resource has side effects', () => {
    const result = noSideEffectsRule.run({
        bundles: [bundleWithImpureResources('a', [analyzedBundleResource('/a.ts')])],
        settings: { noSideEffects: { enabled: true } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('reports a resource with side effects, including line numbers and statement kinds', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [
                impureResource('/init.ts', [
                    { line: 5, kind: 'expression statement' },
                    { line: 12, kind: 'if statement' }
                ])
            ])
        ],
        settings: { noSideEffects: { enabled: true } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, [
        [
            'File "/init.ts" in package "a" has top-level side effects:',
            '  - line 5: expression statement',
            '  - line 12: if statement',
            'Side effects prevent downstream tree-shaking.'
        ].join('\n')
    ]);
});

test('skips a resource that is on the global allowList', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [impureResource('/init.ts', [{ line: 1, kind: 'expression statement' }])])
        ],
        settings: { noSideEffects: { enabled: true, allowList: ['/init.ts'] } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('skips a resource that is on the per-package allowList', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [impureResource('/init.ts', [{ line: 1, kind: 'expression statement' }])])
        ],
        settings: { noSideEffects: { enabled: true } },
        perPackageSettings: consentMap([['a', ['/init.ts']]])
    });

    assert.deepStrictEqual(result, []);
});

test('iterates resources independently and reports only the impure ones', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [
                analyzedBundleResource('/pure.ts'),
                impureResource('/impure.ts', [{ line: 1, kind: 'expression statement' }])
            ])
        ],
        settings: { noSideEffects: { enabled: true } },
        perPackageSettings: new Map()
    });

    assert.strictEqual(result.length, 1);
    const [issue] = result;
    assert.ok(issue?.includes('/impure.ts'));
});

test('iterates bundles independently', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [impureResource('/a.ts', [{ line: 1, kind: 'expression statement' }])]),
            bundleWithImpureResources('b', [impureResource('/b.ts', [{ line: 1, kind: 'if statement' }])])
        ],
        settings: { noSideEffects: { enabled: true } },
        perPackageSettings: new Map()
    });

    assert.strictEqual(result.length, 2);
    assert.ok(result.some((issue) => issue.includes('package "a"')));
    assert.ok(result.some((issue) => issue.includes('package "b"')));
});

test('per-package allowList only suppresses for the listed package', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [impureResource('/shared.ts', [{ line: 1, kind: 'expression statement' }])]),
            bundleWithImpureResources('b', [impureResource('/shared.ts', [{ line: 1, kind: 'expression statement' }])])
        ],
        settings: { noSideEffects: { enabled: true } },
        perPackageSettings: consentMap([['a', ['/shared.ts']]])
    });

    assert.strictEqual(result.length, 1);
    const [issue] = result;
    assert.ok(issue?.includes('package "b"'));
});

test('reports a side effect when the per-package settings entry exists for the bundle but does not include noSideEffects', () => {
    const result = noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [impureResource('/init.ts', [{ line: 1, kind: 'expression statement' }])])
        ],
        settings: { noSideEffects: { enabled: true } },
        perPackageSettings: new Map<string, PackageChecksSettings>([['a', {}]])
    });

    assert.strictEqual(result.length, 1);
});

test('global schema accepts a configuration with enabled and an allowList', () => {
    const result = safeParse(noSideEffectsRule.globalSchema, { enabled: true, allowList: ['/init.ts'] });
    assert.strictEqual(result.success, true);
});

test('global schema rejects a configuration without the enabled flag', () => {
    const result = safeParse(noSideEffectsRule.globalSchema, { allowList: ['/init.ts'] });
    assert.strictEqual(result.success, false);
});

test('per-package schema accepts a configuration with an allowList', () => {
    const result = safeParse(noSideEffectsRule.perPackageSchema, { allowList: ['/init.ts'] });
    assert.strictEqual(result.success, true);
});

test('per-package schema rejects unknown keys', () => {
    const result = safeParse(noSideEffectsRule.perPackageSchema, { unknown: 1 });
    assert.strictEqual(result.success, false);
});
