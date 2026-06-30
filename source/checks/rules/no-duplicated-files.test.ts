import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { PackageChecksSettings } from '../../config/config.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { checkBundle } from '../../test-libraries/check-bundle-fixture.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';

const sharedFilePath = 'shared.ts';

type SymbolAwareProject = {
    readonly bundle: (name: string, sourceFilePath: string, survivingBindings: ReadonlySet<string>) => AnalyzedBundle;
};
type DuplicateRuleSettings = {
    readonly noDuplicatedFiles: { readonly enabled: boolean; readonly allowList?: readonly string[]; };
};
type DuplicateRuleRunArgs = {
    readonly bundles: readonly AnalyzedBundle[];
    readonly settings: DuplicateRuleSettings | undefined;
    readonly perPackageSettings: ReadonlyMap<string, PackageChecksSettings>;
};
type ScenarioDefinition = {
    readonly name: string;
    readonly execute: () => Promise<void>;
};

function bundle(name: string, sourceFilePath: string = sharedFilePath): AnalyzedBundle {
    return checkBundle(name, [ sourceFilePath ]);
}

function createSymbolAwareProject(): SymbolAwareProject {
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

function duplicateIssue(filePath: string, owners: readonly string[]): readonly string[] {
    return [ `File "${filePath}" is included in multiple packages: ${owners.join(', ')}` ];
}

function sharedDeclarationIssue(
    filePath: string,
    owners: readonly string[],
    declarations: readonly string[]
): readonly string[] {
    return [
        [
            `File "${filePath}" has shared declarations across multiple packages:`,
            ...declarations.map(function (declaration) {
                return `  - "${declaration}" → ${owners.join(', ')}`;
            })
        ]
            .join('\n')
    ];
}

function consentMap(
    consenters: readonly (readonly [string, readonly string[]])[]
): ReadonlyMap<string, PackageChecksSettings> {
    return new Map(
        consenters.map(function ([ name, allowList ]) {
            return [ name, { noDuplicatedFiles: { allowList } } ];
        })
    );
}

async function runRule(args: DuplicateRuleRunArgs): Promise<readonly string[]> {
    return await noDuplicatedFilesRule.run(args);
}

async function runWithConsent(
    bundles: readonly AnalyzedBundle[],
    consenters: readonly (readonly [string, readonly string[]])[]
): Promise<readonly string[]> {
    return await runRule({
        bundles,
        settings: { noDuplicatedFiles: { enabled: true } },
        perPackageSettings: consentMap(consenters)
    });
}

async function runWithMixedConsent(secondOwnerSettings: PackageChecksSettings): Promise<readonly string[]> {
    return await runRule({
        bundles: [ bundle('a'), bundle('b') ],
        settings: { noDuplicatedFiles: { enabled: true } },
        perPackageSettings: new Map([
            [ 'a', { noDuplicatedFiles: { allowList: [ sharedFilePath ] } } ],
            [ 'b', secondOwnerSettings ]
        ])
    });
}

function registerScenarioTests<TScenario>(
    scenarios: readonly TScenario[],
    defineScenario: (scenario: TScenario) => ScenarioDefinition
): void {
    const [ scenario, ...remainingScenarios ] = scenarios;
    if (scenario !== undefined) {
        const { name, execute } = defineScenario(scenario);

        test(name, execute);
        registerScenarioTests(remainingScenarios, defineScenario);
    }
}

suite('no-duplicated-files', function () {
    test('rule definition exposes name, schemas and a run function', function () {
        assert.strictEqual(noDuplicatedFilesRule.name, 'noDuplicatedFiles');
        assert.strictEqual(typeof noDuplicatedFilesRule.run, 'function');
        assert.notStrictEqual(noDuplicatedFilesRule.globalSchema, undefined);
        assert.notStrictEqual(noDuplicatedFilesRule.perPackageSchema, undefined);
    });

    suite('consent scenarios', function () {
        const topLevelSettingsScenarios = [
            {
                name: 'returns no issues when settings are missing entirely',
                settings: undefined,
                perPackageSettings: new Map(),
                bundles: [ bundle('a'), bundle('b') ],
                expected: []
            },
            {
                name: 'returns no issues when the rule is disabled at the top level',
                settings: { noDuplicatedFiles: { enabled: false } },
                perPackageSettings: new Map(),
                bundles: [ bundle('a'), bundle('b') ],
                expected: []
            }
        ] as const;

        registerScenarioTests(topLevelSettingsScenarios, function (scenario) {
            return {
                name: scenario.name,
                async execute() {
                    const result = await runRule(scenario);
                    assert.deepStrictEqual(result, scenario.expected);
                }
            };
        });

        const duplicateConsentScenarios = [
            {
                name: 'reports every duplicate when no per-package consent is configured',
                bundles: [ bundle('b'), bundle('a') ],
                consenters: [],
                expected: duplicateIssue(sharedFilePath, [ 'a', 'b' ])
            },
            {
                name: 'ignores duplicates when every owning package consents via its allowList',
                bundles: [ bundle('a'), bundle('b') ],
                consenters: [
                    [ 'a', [ sharedFilePath ] ],
                    [ 'b', [ sharedFilePath ] ]
                ],
                expected: []
            },
            {
                name: 'reports a duplicate when only one owner consents',
                bundles: [ bundle('a'), bundle('b') ],
                consenters: [ [ 'a', [ sharedFilePath ] ] ],
                expected: duplicateIssue(sharedFilePath, [ 'a', 'b' ])
            },
            {
                name: 'reports a duplicate when a third owner did not consent',
                bundles: [ bundle('a'), bundle('b'), bundle('c') ],
                consenters: [
                    [ 'a', [ sharedFilePath ] ],
                    [ 'b', [ sharedFilePath ] ]
                ],
                expected: duplicateIssue(sharedFilePath, [ 'a', 'b', 'c' ])
            },
            {
                name: 'does not match consent for a different file path',
                bundles: [ bundle('a'), bundle('b') ],
                consenters: [
                    [ 'a', [ 'other.ts' ] ],
                    [ 'b', [ 'other.ts' ] ]
                ],
                expected: duplicateIssue(sharedFilePath, [ 'a', 'b' ])
            },
            {
                name: 'returns no issues when there are no duplicates',
                bundles: [ bundle('a', 'a.ts'), bundle('b', 'b.ts') ],
                consenters: [],
                expected: []
            }
        ] as const;

        registerScenarioTests(duplicateConsentScenarios, function (scenario) {
            return {
                name: scenario.name,
                async execute() {
                    const result = await runWithConsent(scenario.bundles, scenario.consenters);
                    assert.deepStrictEqual(result, scenario.expected);
                }
            };
        });

        const mixedConsentScenarios = [
            {
                name: 'reports a duplicate when an owner has per-package settings without a noDuplicatedFiles key',
                secondOwnerSettings: {},
                expected: duplicateIssue(sharedFilePath, [ 'a', 'b' ])
            },
            {
                name: 'reports a duplicate when an owner has noDuplicatedFiles without an allowList',
                secondOwnerSettings: { noDuplicatedFiles: {} },
                expected: duplicateIssue(sharedFilePath, [ 'a', 'b' ])
            }
        ] as const;

        registerScenarioTests(mixedConsentScenarios, function (scenario) {
            return {
                name: scenario.name,
                async execute() {
                    const result = await runWithMixedConsent(scenario.secondOwnerSettings);
                    assert.deepStrictEqual(result, scenario.expected);
                }
            };
        });

        const globalAllowListScenarios = [
            {
                name:
                    'ignores duplicates when the global allowList contains the file path even without per-package consent',
                settings: { noDuplicatedFiles: { enabled: true, allowList: [ sharedFilePath ] } },
                expected: []
            },
            {
                name: 'reports a duplicate that is not present in the global allowList',
                settings: { noDuplicatedFiles: { enabled: true, allowList: [ 'other.ts' ] } },
                expected: duplicateIssue(sharedFilePath, [ 'a', 'b' ])
            }
        ] as const;

        registerScenarioTests(globalAllowListScenarios, function (scenario) {
            return {
                name: scenario.name,
                async execute() {
                    const result = await runRule({
                        bundles: [ bundle('a'), bundle('b') ],
                        settings: scenario.settings,
                        perPackageSettings: new Map()
                    });
                    assert.deepStrictEqual(result, scenario.expected);
                }
            };
        });
    });

    suite('shared declaration scenarios', function () {
        const project = createSymbolAwareProject();

        const sharedDeclarationScenarios = [
            {
                name: 'reports shared declarations when surviving bindings overlap',
                bundles: [
                    project.bundle('pkg1', '/helpers.ts', new Set([ 'format', 'validate' ])),
                    project.bundle('pkg2', '/helpers.ts', new Set([ 'format', 'parse' ]))
                ],
                settings: { noDuplicatedFiles: { enabled: true } },
                expected: sharedDeclarationIssue('/helpers.ts', [ 'pkg1', 'pkg2' ], [ 'format' ])
            },
            {
                name: 'does not report when surviving binding sets are fully disjoint',
                bundles: [
                    project.bundle('pkg1', '/helpers.ts', new Set([ 'validate' ])),
                    project.bundle('pkg2', '/helpers.ts', new Set([ 'parse' ]))
                ],
                settings: { noDuplicatedFiles: { enabled: true } },
                expected: []
            },
            {
                name: 'lists every shared declaration in alphabetical order',
                bundles: [
                    project.bundle('pkg1', '/util.ts', new Set([ 'zeta', 'alpha', 'parse' ])),
                    project.bundle('pkg2', '/util.ts', new Set([ 'zeta', 'alpha', 'validate' ]))
                ],
                settings: { noDuplicatedFiles: { enabled: true } },
                expected: sharedDeclarationIssue('/util.ts', [ 'pkg1', 'pkg2' ], [ 'alpha', 'zeta' ])
            },
            {
                name:
                    'does not report when one owner has no surviving bindings and the other has bindings that do not match',
                bundles: [
                    project.bundle('pkg1', '/helpers.ts', new Set([ 'format' ])),
                    bundle('pkg2', '/helpers.ts')
                ],
                settings: { noDuplicatedFiles: { enabled: true } },
                expected: []
            },
            {
                name: 'global allowList suppresses the symbol-level message',
                bundles: [
                    project.bundle('pkg1', '/helpers.ts', new Set([ 'format' ])),
                    project.bundle('pkg2', '/helpers.ts', new Set([ 'format' ]))
                ],
                settings: { noDuplicatedFiles: { enabled: true, allowList: [ '/helpers.ts' ] } },
                expected: []
            }
        ] as const;

        registerScenarioTests(sharedDeclarationScenarios, function (scenario) {
            return {
                name: scenario.name,
                async execute() {
                    const result = await runRule({
                        bundles: scenario.bundles,
                        settings: scenario.settings,
                        perPackageSettings: new Map()
                    });
                    assert.deepStrictEqual(result, scenario.expected);
                }
            };
        });
    });

    test('does not report when only a single bundle owns the file', async function () {
        const result = await runRule({
            bundles: [ bundle('a') ],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('falls back to path-level message when surviving bindings are unavailable for every owner', async function () {
        const result = await runRule({
            bundles: [ bundle('a'), bundle('b') ],
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, duplicateIssue(sharedFilePath, [ 'a', 'b' ]));
    });
});
