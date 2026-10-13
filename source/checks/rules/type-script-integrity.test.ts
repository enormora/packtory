import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { emptyCheckContext, checkBundle, checkPublishedPackage } from '../../test-libraries/check-fixtures.ts';
import type { PackageResolutionReport } from './type-script-package-resolution.ts';
import {
    createTypeScriptIntegrityRule,
    type TypeScriptIntegrityDependencies,
    type TypeScriptIntegrityRule
} from './type-script-integrity.ts';

type CheckBundle = Parameters<TypeScriptIntegrityRule['run']>[0]['bundles'][number];

type RuleOverrides = {
    readonly analyzePackageResolution?: SinonSpy;
    readonly summarizeDeclarationIntegrity?: SinonSpy;
};

const noProblemsReport: PackageResolutionReport = { kind: 'analyzed', entrypoints: [ '.' ], problems: [] };

function ruleFor(overrides: RuleOverrides = {}): TypeScriptIntegrityRule {
    const {
        analyzePackageResolution = fake.resolves(noProblemsReport),
        summarizeDeclarationIntegrity = fake.returns([])
    } = overrides;
    const fakeDependencies = {
        analyzePackageResolution,
        summarizeDeclarationIntegrity
    } as unknown as TypeScriptIntegrityDependencies;

    return createTypeScriptIntegrityRule(fakeDependencies);
}

type Settings = {
    readonly typeScriptIntegrity: {
        readonly enabled: boolean;
        readonly declarations?: 'all' | 'exports-graph';
    };
};

type RunOptions = {
    readonly rule: TypeScriptIntegrityRule;
    readonly settings: Settings | undefined;
    readonly publishedPackages: ReadonlyMap<string, PublishedPackageWithManifest> | undefined;
    readonly bundleNames: readonly string[];
};

async function runRule(options: RunOptions): Promise<readonly string[]> {
    return await options.rule.run({
        bundles: options.bundleNames.map(function (bundleName) {
            return checkBundle(bundleName, [ 'index.js', 'index.d.ts' ]);
        }),
        publishedPackages: options.publishedPackages,
        settings: options.settings,
        ...emptyCheckContext(),
        packageConfigurations: {}
    });
}

async function runRuleForBundles(
    rule: TypeScriptIntegrityRule,
    bundles: readonly CheckBundle[],
    publishedPackages: ReadonlyMap<string, PublishedPackageWithManifest>
): Promise<readonly string[]> {
    return await rule.run({
        bundles,
        publishedPackages,
        settings: { typeScriptIntegrity: { enabled: true } },
        ...emptyCheckContext(),
        packageConfigurations: {}
    });
}

function publishedPackagesFor(...names: readonly string[]): ReadonlyMap<string, PublishedPackageWithManifest> {
    return new Map(
        names.map(function (name) {
            return [ name, checkPublishedPackage(name, '{"types":"./index.d.ts"}', { 'index.d.ts': 'export {};\n' }) ];
        })
    );
}

function executableOnlyBundle(name: string, hasDeclaration: boolean): CheckBundle {
    const base = checkBundle(name, hasDeclaration ? [ 'cli.js', 'cli.d.ts' ] : [ 'cli.js' ]);
    return {
        ...base,
        roots: {
            commandLineInterface: {
                javaScript: {
                    content: '',
                    isExecutable: true,
                    inputFilePath: 'cli.js',
                    targetFilePath: 'cli.js'
                },
                ...hasDeclaration
                    ? {
                        declarationFile: {
                            content: '',
                            isExecutable: false,
                            inputFilePath: 'cli.d.ts',
                            targetFilePath: 'cli.d.ts'
                        }
                    }
                    : {}
            }
        },
        surface: {
            mode: 'explicit',
            packageInterface: { executables: [ { root: 'commandLineInterface', name } ] }
        }
    };
}

function moduleAndExecutableBundle(name: string): CheckBundle {
    const base = checkBundle(name, [ 'index.js', 'cli.js' ]);
    return {
        ...base,
        roots: {
            main: {
                javaScript: {
                    content: '',
                    isExecutable: false,
                    inputFilePath: 'index.js',
                    targetFilePath: 'index.js'
                }
            },
            commandLineInterface: {
                javaScript: {
                    content: '',
                    isExecutable: true,
                    inputFilePath: 'cli.js',
                    targetFilePath: 'cli.js'
                }
            }
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [ { root: 'main', export: '.' } ],
                executables: [ { root: 'commandLineInterface', name } ]
            }
        }
    };
}

suite('type-script-integrity', function () {
    suite('configuration', function () {
        test('exposes the rule name and its schemas', function () {
            const rule = ruleFor();

            assert.strictEqual(rule.name, 'typeScriptIntegrity');
            assert.deepStrictEqual(rule.globalSchema.safeParse({ enabled: true }).success, true);
            assert.deepStrictEqual(rule.globalSchema.safeParse({ enabled: true, declarations: 'all' }).success, true);
            assert.deepStrictEqual(
                rule.globalSchema.safeParse({ enabled: true, declarations: 'exports-graph' }).success,
                true
            );
            assert.deepStrictEqual(rule.globalSchema.safeParse({ enabled: true, declarations: 'nope' }).success, false);
            assert.deepStrictEqual(rule.perPackageSchema.safeParse({}).success, true);
        });

        test('checks nothing when the rule is not configured', async function () {
            const analyzePackageResolution = fake.resolves(noProblemsReport);
            const summarizeDeclarationIntegrity = fake.returns([]);

            const issues = await runRule({
                rule: ruleFor({ analyzePackageResolution, summarizeDeclarationIntegrity }),
                settings: undefined,
                publishedPackages: publishedPackagesFor('package'),
                bundleNames: [ 'package' ]
            });

            assert.deepStrictEqual(issues, []);
            assert.strictEqual(analyzePackageResolution.callCount, 0);
            assert.strictEqual(summarizeDeclarationIntegrity.callCount, 0);
        });

        test('checks nothing when the rule is disabled', async function () {
            const analyzePackageResolution = fake.resolves(noProblemsReport);

            const issues = await runRule({
                rule: ruleFor({ analyzePackageResolution }),
                settings: { typeScriptIntegrity: { enabled: false } },
                publishedPackages: publishedPackagesFor('package'),
                bundleNames: [ 'package' ]
            });

            assert.deepStrictEqual(issues, []);
            assert.strictEqual(analyzePackageResolution.callCount, 0);
        });
    });

    test('analyzes package resolution for the checked resolution kinds', async function () {
        const analyzePackageResolution = fake.resolves(noProblemsReport);
        const publishedPackages = publishedPackagesFor('package');

        await runRule({
            rule: ruleFor({ analyzePackageResolution }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages,
            bundleNames: [ 'package' ]
        });

        assert.deepStrictEqual(analyzePackageResolution.args, [
            [ publishedPackages.get('package'), [ 'node16-esm', 'bundler' ] ]
        ]);
    });

    test('summarizes the reported resolution problems', async function () {
        const issues = await runRule({
            rule: ruleFor({
                analyzePackageResolution: fake.resolves({
                    kind: 'analyzed',
                    entrypoints: [ '.' ],
                    problems: [
                        {
                            kind: 'CommonJavaScriptResolvesToEcmaScriptModule',
                            shortDescription: 'Missing `export =`',
                            affectedResolutionKinds: [ 'bundler' ],
                            affectedEntrypoints: [ '.' ]
                        }
                    ]
                })
            }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages: publishedPackagesFor('package'),
            bundleNames: [ 'package' ]
        });

        assert.deepStrictEqual(issues, [
            'Package "package" failed TypeScript integrity: Missing `export =` ' +
            'affecting entrypoints "." in resolutions "bundler"'
        ]);
    });

    test('turns a failing package-resolution analysis into a check issue', async function () {
        const issues = await runRule({
            rule: ruleFor({
                analyzePackageResolution: fake.rejects(new Error('File not found: /node_modules/package/package.json'))
            }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages: publishedPackagesFor('package'),
            bundleNames: [ 'package' ]
        });

        assert.deepStrictEqual(issues, [
            'Package "package" failed TypeScript integrity: Error: File not found: /node_modules/package/package.json'
        ]);
    });

    test('checks all packaged declarations by default', async function () {
        const summarizeDeclarationIntegrity = fake.returns([]);
        const publishedPackages = publishedPackagesFor('package');

        await runRule({
            rule: ruleFor({ summarizeDeclarationIntegrity }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages,
            bundleNames: [ 'package' ]
        });

        assert.deepStrictEqual(summarizeDeclarationIntegrity.args, [
            [ 'package', publishedPackages.get('package'), 'all', publishedPackages ]
        ]);
    });

    test('checks the configured declarations mode', async function () {
        const summarizeDeclarationIntegrity = fake.returns([]);
        const publishedPackages = publishedPackagesFor('package');

        await runRule({
            rule: ruleFor({ summarizeDeclarationIntegrity }),
            settings: { typeScriptIntegrity: { enabled: true, declarations: 'exports-graph' } },
            publishedPackages,
            bundleNames: [ 'package' ]
        });

        assert.deepStrictEqual(summarizeDeclarationIntegrity.args, [
            [ 'package', publishedPackages.get('package'), 'exports-graph', publishedPackages ]
        ]);
    });

    test('reports resolution issues before declaration issues of every package', async function () {
        const issues = await runRule({
            rule: ruleFor({
                analyzePackageResolution: fake.resolves({ kind: 'missing-declarations' }),
                summarizeDeclarationIntegrity: fake.returns([ 'declaration issue' ])
            }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages: publishedPackagesFor('package-a', 'package-b'),
            bundleNames: [ 'package-a', 'package-b' ]
        });

        assert.deepStrictEqual(issues, [
            'Package "package-a" does not expose TypeScript declarations',
            'declaration issue',
            'Package "package-b" does not expose TypeScript declarations',
            'declaration issue'
        ]);
    });

    suite('bin-only packages', function () {
        test('skips package resolution and declaration checks for untyped bin-only packages', async function () {
            const analyzePackageResolution = fake.resolves({ kind: 'missing-declarations' });
            const summarizeDeclarationIntegrity = fake.returns([ 'declaration issue' ]);

            const issues = await runRuleForBundles(
                ruleFor({ analyzePackageResolution, summarizeDeclarationIntegrity }),
                [ executableOnlyBundle('package', false) ],
                new Map([ [
                    'package',
                    checkPublishedPackage('package', '{"bin":{"package":"./cli.js"}}', { 'cli.js': '' })
                ] ])
            );

            assert.deepStrictEqual(issues, []);
            assert.strictEqual(analyzePackageResolution.callCount, 0);
            assert.strictEqual(summarizeDeclarationIntegrity.callCount, 0);
        });

        test('runs declaration integrity only for typed bin-only packages', async function () {
            const analyzePackageResolution = fake.resolves({ kind: 'missing-declarations' });
            const summarizeDeclarationIntegrity = fake.returns([ 'declaration issue' ]);
            const publishedPackage = checkPublishedPackage(
                'package',
                '{"exports":{".":{"types":"./cli.d.ts"}},"bin":{"package":"./cli.js"}}',
                { 'cli.js': '', 'cli.d.ts': 'export {};\n' }
            );

            const issues = await runRuleForBundles(
                ruleFor({ analyzePackageResolution, summarizeDeclarationIntegrity }),
                [ executableOnlyBundle('package', true) ],
                new Map([ [ 'package', publishedPackage ] ])
            );

            assert.deepStrictEqual(issues, [ 'declaration issue' ]);
            assert.strictEqual(analyzePackageResolution.callCount, 0);
            assert.deepStrictEqual(summarizeDeclarationIntegrity.args, [
                [ 'package', publishedPackage, 'all', new Map([ [ 'package', publishedPackage ] ]) ]
            ]);
        });

        test('runs declaration integrity when any bin-only root has declarations', async function () {
            const summarizeDeclarationIntegrity = fake.returns([ 'declaration issue' ]);
            const bundle = {
                ...executableOnlyBundle('package', true),
                surface: {
                    mode: 'explicit' as const,
                    packageInterface: {
                        executables: [
                            { root: 'missing', name: 'missing-bin' },
                            { root: 'commandLineInterface', name: 'package' }
                        ] as const
                    }
                }
            };

            const issues = await runRuleForBundles(
                ruleFor({ summarizeDeclarationIntegrity }),
                [ bundle ],
                publishedPackagesFor('package')
            );

            assert.deepStrictEqual(issues, [ 'declaration issue' ]);
        });

        test('skips checks for an explicit package without module or bin entries', async function () {
            const analyzePackageResolution = fake.resolves({ kind: 'missing-declarations' });
            const summarizeDeclarationIntegrity = fake.returns([ 'declaration issue' ]);
            const bundle = {
                ...executableOnlyBundle('package', false),
                surface: {
                    mode: 'explicit' as const,
                    packageInterface: {}
                }
            };

            const issues = await runRuleForBundles(
                ruleFor({ analyzePackageResolution, summarizeDeclarationIntegrity }),
                [ bundle ],
                publishedPackagesFor('package')
            );

            assert.deepStrictEqual(issues, []);
            assert.strictEqual(analyzePackageResolution.callCount, 0);
            assert.strictEqual(summarizeDeclarationIntegrity.callCount, 0);
        });

        test('checks package resolution normally when a package declares modules and executables', async function () {
            const analyzePackageResolution = fake.resolves({ kind: 'missing-declarations' });
            const summarizeDeclarationIntegrity = fake.returns([]);

            const issues = await runRuleForBundles(
                ruleFor({ analyzePackageResolution, summarizeDeclarationIntegrity }),
                [ moduleAndExecutableBundle('package') ],
                new Map([ [ 'package', checkPublishedPackage('package', '{"exports":{".":"./index.js"}}', {}) ] ])
            );

            assert.deepStrictEqual(issues, [ 'Package "package" does not expose TypeScript declarations' ]);
            assert.strictEqual(analyzePackageResolution.callCount, 1);
        });
    });

    suite('published packages', function () {
        test('throws when the rule is enabled but no emitted packages are present', async function () {
            await assert.rejects(
                async function () {
                    await runRule({
                        rule: ruleFor(),
                        settings: { typeScriptIntegrity: { enabled: true } },
                        publishedPackages: undefined,
                        bundleNames: [ 'package' ]
                    });
                },
                /Published packages missing for TypeScript integrity/u
            );
        });

        test('throws when one checked bundle has no emitted package', async function () {
            await assert.rejects(
                async function () {
                    await runRule({
                        rule: ruleFor(),
                        settings: { typeScriptIntegrity: { enabled: true } },
                        publishedPackages: publishedPackagesFor('package-a'),
                        bundleNames: [ 'package-a', 'package-b' ]
                    });
                },
                /Published package missing for "package-b"/u
            );
        });
    });
});
