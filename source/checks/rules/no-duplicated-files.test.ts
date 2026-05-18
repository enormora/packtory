import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { PackageChecksSettings } from '../../config/config.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { checkBundle } from '../../test-libraries/check-bundle-fixture.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';

function bundle(name: string, sourceFilePath: string): AnalyzedBundle {
    return checkBundle(name, [sourceFilePath]);
}

function createSymbolAwareProject(): {
    readonly bundle: (name: string, sourceFilePath: string, survivingBindings: ReadonlySet<string>) => AnalyzedBundle;
} {
    return {
        bundle(name, sourceFilePath, survivingBindings) {
            return analyzedBundle({
                name,
                contents: [
                    analyzedBundleResource(sourceFilePath, {
                        targetFilePath: sourceFilePath,
                        analysis: { survivingBindings }
                    })
                ]
            });
        }
    };
}

function consentMap(
    consenters: readonly (readonly [string, readonly string[]])[]
): ReadonlyMap<string, PackageChecksSettings> {
    return new Map(
        consenters.map(([name, allowList]) => {
            return [name, { noDuplicatedFiles: { allowList } }];
        })
    );
}

function runWithConsent(
    bundles: readonly AnalyzedBundle[],
    consenters: readonly (readonly [string, readonly string[]])[]
): readonly string[] {
    return noDuplicatedFilesRule.run({
        bundles,
        settings: { noDuplicatedFiles: { enabled: true } },
        perPackageSettings: consentMap(consenters)
    });
}

suite('no-duplicated-files', function () {
    test('rule definition exposes name, schemas and a run function', function () {
        assert.strictEqual(noDuplicatedFilesRule.name, 'noDuplicatedFiles');
        assert.strictEqual(typeof noDuplicatedFilesRule.run, 'function');
        assert.notStrictEqual(noDuplicatedFilesRule.globalSchema, undefined);
        assert.notStrictEqual(noDuplicatedFilesRule.perPackageSchema, undefined);
    });

    test('returns no issues when settings are missing entirely', function () {
        const result = noDuplicatedFilesRule.run({
            bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
            settings: undefined,
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when the rule is disabled at the top level', function () {
        const result = noDuplicatedFilesRule.run({
            bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
            settings: { noDuplicatedFiles: { enabled: false } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('reports every duplicate when no per-package consent is configured', function () {
        const result = runWithConsent([bundle('b', 'shared.ts'), bundle('a', 'shared.ts')], []);

        assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('ignores duplicates when every owning package consents via its allowList', function () {
        const result = runWithConsent(
            [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
            [
                ['a', ['shared.ts']],
                ['b', ['shared.ts']]
            ]
        );

        assert.deepStrictEqual(result, []);
    });

    test('reports a duplicate when only one owner consents', function () {
        const result = runWithConsent([bundle('a', 'shared.ts'), bundle('b', 'shared.ts')], [['a', ['shared.ts']]]);

        assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('reports a duplicate when a third owner did not consent', function () {
        const result = runWithConsent(
            [bundle('a', 'shared.ts'), bundle('b', 'shared.ts'), bundle('c', 'shared.ts')],
            [
                ['a', ['shared.ts']],
                ['b', ['shared.ts']]
            ]
        );

        assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b, c']);
    });

    test('does not match consent for a different file path', function () {
        const result = runWithConsent(
            [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
            [
                ['a', ['other.ts']],
                ['b', ['other.ts']]
            ]
        );

        assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('returns no issues when there are no duplicates', function () {
        const result = runWithConsent([bundle('a', 'a.ts'), bundle('b', 'b.ts')], []);

        assert.deepStrictEqual(result, []);
    });

    function runWithMixedConsent(secondOwnerSettings: PackageChecksSettings): readonly string[] {
        return noDuplicatedFilesRule.run({
            bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map([
                ['a', { noDuplicatedFiles: { allowList: ['shared.ts'] } }],
                ['b', secondOwnerSettings]
            ])
        });
    }

    test('reports a duplicate when an owner has per-package settings without a noDuplicatedFiles key', function () {
        const result = runWithMixedConsent({});

        assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('reports a duplicate when an owner has noDuplicatedFiles without an allowList', function () {
        const result = runWithMixedConsent({ noDuplicatedFiles: {} });

        assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('ignores duplicates when the global allowList contains the file path even without per-package consent', function () {
        const result = noDuplicatedFilesRule.run({
            bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
            settings: { noDuplicatedFiles: { enabled: true, allowList: ['shared.ts'] } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('reports a duplicate that is not present in the global allowList', function () {
        const result = noDuplicatedFilesRule.run({
            bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
            settings: { noDuplicatedFiles: { enabled: true, allowList: ['other.ts'] } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('reports shared declarations when surviving bindings overlap', function () {
        const project = createSymbolAwareProject();
        const result = noDuplicatedFilesRule.run({
            bundles: [
                project.bundle('pkg1', '/helpers.ts', new Set(['format', 'validate'])),
                project.bundle('pkg2', '/helpers.ts', new Set(['format', 'parse']))
            ],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, [
            ['File "/helpers.ts" has shared declarations across multiple packages:', '  - "format" → pkg1, pkg2'].join(
                '\n'
            )
        ]);
    });

    test('does not report when surviving binding sets are fully disjoint', function () {
        const project = createSymbolAwareProject();
        const result = noDuplicatedFilesRule.run({
            bundles: [
                project.bundle('pkg1', '/helpers.ts', new Set(['validate'])),
                project.bundle('pkg2', '/helpers.ts', new Set(['parse']))
            ],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('lists every shared declaration in alphabetical order', function () {
        const project = createSymbolAwareProject();
        const result = noDuplicatedFilesRule.run({
            bundles: [
                project.bundle('pkg1', '/util.ts', new Set(['zeta', 'alpha', 'parse'])),
                project.bundle('pkg2', '/util.ts', new Set(['zeta', 'alpha', 'validate']))
            ],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, [
            [
                'File "/util.ts" has shared declarations across multiple packages:',
                '  - "alpha" → pkg1, pkg2',
                '  - "zeta" → pkg1, pkg2'
            ].join('\n')
        ]);
    });

    test('does not report when only a single bundle owns the file', function () {
        const result = noDuplicatedFilesRule.run({
            bundles: [bundle('a', 'shared.ts')],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('does not report when one owner has no surviving bindings and the other has bindings that do not match', function () {
        const project = createSymbolAwareProject();
        const result = noDuplicatedFilesRule.run({
            bundles: [project.bundle('pkg1', '/helpers.ts', new Set(['format'])), bundle('pkg2', '/helpers.ts')],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('falls back to path-level message when surviving bindings are unavailable for every owner', function () {
        const result = noDuplicatedFilesRule.run({
            bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('global allowList suppresses the symbol-level message', function () {
        const project = createSymbolAwareProject();
        const result = noDuplicatedFilesRule.run({
            bundles: [
                project.bundle('pkg1', '/helpers.ts', new Set(['format'])),
                project.bundle('pkg2', '/helpers.ts', new Set(['format']))
            ],
            settings: { noDuplicatedFiles: { enabled: true, allowList: ['/helpers.ts'] } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });
});
