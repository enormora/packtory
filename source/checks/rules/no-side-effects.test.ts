import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../../common/schema-validation.ts';
import type { PackageChecksSettings } from '../../config/config.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import type { RuleRunParams } from '../rule.ts';
import { noSideEffectsRule } from './no-side-effects.ts';

type NoSideEffectsGlobalConfig = {
    readonly allowList: readonly string[];
    readonly enabled: boolean;
};
type NoSideEffectsPerPackageConfig = {
    readonly allowList?: readonly string[] | undefined;
};
type NoSideEffectsRunParams = RuleRunParams<
    'noSideEffects',
    NoSideEffectsGlobalConfig,
    NoSideEffectsPerPackageConfig
>;

type SideEffectStatement = {
    readonly line: number;
    readonly kind: string;
};

function impureResource(
    sourceFilePath: string,
    statements: readonly SideEffectStatement[]
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
        consenters.map(function ([ name, allowList ]) {
            return [ name, { noSideEffects: { allowList } } ];
        })
    );
}

async function runWithInitSideEffect(
    settings: NoSideEffectsRunParams['settings'],
    perPackageSettings: ReadonlyMap<string, PackageChecksSettings>
): Promise<readonly string[]> {
    return await noSideEffectsRule.run({
        bundles: [
            bundleWithImpureResources('a', [
                impureResource('/init.ts', [ { line: 1, kind: 'expression statement' } ])
            ])
        ],
        settings,
        perPackageSettings
    });
}

suite('no-side-effects', function () {
    suite('disabled and basic reports', function () {
        test('rule definition exposes name, schemas and a run function', function () {
            assert.strictEqual(noSideEffectsRule.name, 'noSideEffects');
            assert.strictEqual(typeof noSideEffectsRule.run, 'function');
            assert.notStrictEqual(noSideEffectsRule.globalSchema, undefined);
            assert.notStrictEqual(noSideEffectsRule.perPackageSchema, undefined);
        });

        test('returns no issues when settings are missing entirely', async function () {
            const result = await noSideEffectsRule.run({
                bundles: [
                    bundleWithImpureResources('a', [
                        impureResource('/a.ts', [ { line: 1, kind: 'expression statement' } ])
                    ])
                ],
                settings: undefined,
                perPackageSettings: new Map()
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when the rule is disabled at the top level', async function () {
            const result = await noSideEffectsRule.run({
                bundles: [
                    bundleWithImpureResources('a', [
                        impureResource('/a.ts', [ { line: 1, kind: 'expression statement' } ])
                    ])
                ],
                settings: { noSideEffects: { enabled: false } },
                perPackageSettings: new Map()
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when no resource has side effects', async function () {
            const result = await noSideEffectsRule.run({
                bundles: [ bundleWithImpureResources('a', [ analyzedBundleResource('/a.ts') ]) ],
                settings: { noSideEffects: { enabled: true, allowList: [] } },
                perPackageSettings: new Map()
            });

            assert.deepStrictEqual(result, []);
        });

        test('reports a resource with side effects, including line numbers and statement kinds', async function () {
            const result = await noSideEffectsRule.run({
                bundles: [
                    bundleWithImpureResources('a', [
                        impureResource('/init.ts', [
                            { line: 5, kind: 'expression statement' },
                            { line: 12, kind: 'if statement' }
                        ])
                    ])
                ],
                settings: { noSideEffects: { enabled: true, allowList: [] } },
                perPackageSettings: new Map()
            });

            assert.deepStrictEqual(result, [
                [
                    'File "/init.ts" in package "a" has top-level side effects:',
                    '  - line 5: expression statement',
                    '  - line 12: if statement',
                    'Side effects prevent downstream tree-shaking.'
                ]
                    .join('\n')
            ]);
        });
    });

    suite('allow lists', function () {
        test('skips a resource that is on the global allowList', async function () {
            const result = await runWithInitSideEffect(
                { noSideEffects: { enabled: true, allowList: [ '/init.ts' ] } },
                new Map()
            );

            assert.deepStrictEqual(result, []);
        });

        test('skips a resource that is on the per-package allowList', async function () {
            const result = await runWithInitSideEffect(
                { noSideEffects: { enabled: true, allowList: [] } },
                consentMap([ [ 'a', [ '/init.ts' ] ] ])
            );

            assert.deepStrictEqual(result, []);
        });
    });

    suite('bundle iteration', function () {
        test('iterates resources independently and reports only the impure ones', async function () {
            const result = await noSideEffectsRule.run({
                bundles: [
                    bundleWithImpureResources('a', [
                        analyzedBundleResource('/pure.ts'),
                        impureResource('/impure.ts', [ { line: 1, kind: 'expression statement' } ])
                    ])
                ],
                settings: { noSideEffects: { enabled: true, allowList: [] } },
                perPackageSettings: new Map()
            });

            assert.strictEqual(result.length, 1);
            const [ issue ] = result;
            assert.strictEqual(issue?.includes('/impure.ts'), true);
        });

        test('iterates bundles independently', async function () {
            const result = await noSideEffectsRule.run({
                bundles: [
                    bundleWithImpureResources('a', [
                        impureResource('/a.ts', [ { line: 1, kind: 'expression statement' } ])
                    ]),
                    bundleWithImpureResources('b', [ impureResource('/b.ts', [ { line: 1, kind: 'if statement' } ]) ])
                ],
                settings: { noSideEffects: { enabled: true, allowList: [] } },
                perPackageSettings: new Map()
            });

            assert.strictEqual(result.length, 2);
            assert.strictEqual(
                result.some(function (issue) {
                    return issue.includes('package "a"');
                }),
                true
            );
            assert.strictEqual(
                result.some(function (issue) {
                    return issue.includes('package "b"');
                }),
                true
            );
        });

        test('per-package allowList only suppresses for the listed package', async function () {
            const result = await noSideEffectsRule.run({
                bundles: [
                    bundleWithImpureResources('a', [
                        impureResource('/shared.ts', [ { line: 1, kind: 'expression statement' } ])
                    ]),
                    bundleWithImpureResources('b', [
                        impureResource('/shared.ts', [ { line: 1, kind: 'expression statement' } ])
                    ])
                ],
                settings: { noSideEffects: { enabled: true, allowList: [] } },
                perPackageSettings: consentMap([ [ 'a', [ '/shared.ts' ] ] ])
            });

            assert.strictEqual(result.length, 1);
            const [ issue ] = result;
            assert.strictEqual(issue?.includes('package "b"'), true);
        });

        test('reports a side effect when the per-package settings entry exists for the bundle but does not include noSideEffects', async function () {
            const result = await runWithInitSideEffect(
                { noSideEffects: { enabled: true, allowList: [] } },
                new Map<string, PackageChecksSettings>([ [ 'a', {} ] ])
            );

            assert.strictEqual(result.length, 1);
        });
    });

    suite('schemas', function () {
        test('global schema accepts a configuration with enabled and an allowList', function () {
            const result = safeParse(noSideEffectsRule.globalSchema, { enabled: true, allowList: [ '/init.ts' ] });
            assert.strictEqual(result.success, true);
        });

        test('global schema rejects a configuration without the enabled flag', function () {
            const result = safeParse(noSideEffectsRule.globalSchema, { allowList: [ '/init.ts' ] });
            assert.strictEqual(result.success, false);
        });

        test('per-package schema accepts a configuration with an allowList', function () {
            const result = safeParse(noSideEffectsRule.perPackageSchema, { allowList: [ '/init.ts' ] });
            assert.strictEqual(result.success, true);
        });

        test('per-package schema rejects unknown keys', function () {
            const result = safeParse(noSideEffectsRule.perPackageSchema, { unknown: 1 });
            assert.strictEqual(result.success, false);
        });
    });
});
