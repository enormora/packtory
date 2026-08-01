import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { checkBundle, checkPublishedPackage } from '../../test-libraries/check-fixtures.ts';
import type { PackageResolutionReport } from './type-script-package-resolution.ts';
import {
    createTypeScriptIntegrityRule,
    type TypeScriptIntegrityDependencies,
    type TypeScriptIntegrityRule
} from './type-script-integrity.ts';

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
        perPackageSettings: new Map(),
        packageConfigs: {}
    });
}

function publishedPackagesFor(...names: readonly string[]): ReadonlyMap<string, PublishedPackageWithManifest> {
    return new Map(
        names.map(function (name) {
            return [ name, checkPublishedPackage(name, '{"types":"./index.d.ts"}', { 'index.d.ts': 'export {};\n' }) ];
        })
    );
}

suite('type-script-integrity', function () {
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
            publishedPackages: publishedPackagesFor('pkg'),
            bundleNames: [ 'pkg' ]
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
            publishedPackages: publishedPackagesFor('pkg'),
            bundleNames: [ 'pkg' ]
        });

        assert.deepStrictEqual(issues, []);
        assert.strictEqual(analyzePackageResolution.callCount, 0);
    });

    test('analyzes package resolution for the checked resolution kinds', async function () {
        const analyzePackageResolution = fake.resolves(noProblemsReport);
        const publishedPackages = publishedPackagesFor('pkg');

        await runRule({
            rule: ruleFor({ analyzePackageResolution }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages,
            bundleNames: [ 'pkg' ]
        });

        assert.deepStrictEqual(analyzePackageResolution.args, [
            [ publishedPackages.get('pkg'), [ 'node16-esm', 'bundler' ] ]
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
                            kind: 'CJSResolvesToESM',
                            shortDescription: 'Missing `export =`',
                            affectedResolutionKinds: [ 'bundler' ],
                            affectedEntrypoints: [ '.' ]
                        }
                    ]
                })
            }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages: publishedPackagesFor('pkg'),
            bundleNames: [ 'pkg' ]
        });

        assert.deepStrictEqual(issues, [
            'Package "pkg" failed TypeScript integrity: Missing `export =` ' +
            'affecting entrypoints "." in resolutions "bundler"'
        ]);
    });

    test('turns a failing package-resolution analysis into a check issue', async function () {
        const issues = await runRule({
            rule: ruleFor({
                analyzePackageResolution: fake.rejects(new Error('File not found: /node_modules/pkg/package.json'))
            }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages: publishedPackagesFor('pkg'),
            bundleNames: [ 'pkg' ]
        });

        assert.deepStrictEqual(issues, [
            'Package "pkg" failed TypeScript integrity: Error: File not found: /node_modules/pkg/package.json'
        ]);
    });

    test('checks all packaged declarations by default', async function () {
        const summarizeDeclarationIntegrity = fake.returns([]);
        const publishedPackages = publishedPackagesFor('pkg');

        await runRule({
            rule: ruleFor({ summarizeDeclarationIntegrity }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages,
            bundleNames: [ 'pkg' ]
        });

        assert.deepStrictEqual(summarizeDeclarationIntegrity.args, [
            [ 'pkg', publishedPackages.get('pkg'), 'all', publishedPackages ]
        ]);
    });

    test('checks the configured declarations mode', async function () {
        const summarizeDeclarationIntegrity = fake.returns([]);
        const publishedPackages = publishedPackagesFor('pkg');

        await runRule({
            rule: ruleFor({ summarizeDeclarationIntegrity }),
            settings: { typeScriptIntegrity: { enabled: true, declarations: 'exports-graph' } },
            publishedPackages,
            bundleNames: [ 'pkg' ]
        });

        assert.deepStrictEqual(summarizeDeclarationIntegrity.args, [
            [ 'pkg', publishedPackages.get('pkg'), 'exports-graph', publishedPackages ]
        ]);
    });

    test('reports resolution issues before declaration issues of every package', async function () {
        const issues = await runRule({
            rule: ruleFor({
                analyzePackageResolution: fake.resolves({ kind: 'missing-declarations' }),
                summarizeDeclarationIntegrity: fake.returns([ 'declaration issue' ])
            }),
            settings: { typeScriptIntegrity: { enabled: true } },
            publishedPackages: publishedPackagesFor('pkg-a', 'pkg-b'),
            bundleNames: [ 'pkg-a', 'pkg-b' ]
        });

        assert.deepStrictEqual(issues, [
            'Package "pkg-a" does not expose TypeScript declarations',
            'declaration issue',
            'Package "pkg-b" does not expose TypeScript declarations',
            'declaration issue'
        ]);
    });

    suite('published packages', function () {
        test('throws when the rule is enabled but no emitted packages are present', async function () {
            await assert.rejects(
                async function () {
                    await runRule({
                        rule: ruleFor(),
                        settings: { typeScriptIntegrity: { enabled: true } },
                        publishedPackages: undefined,
                        bundleNames: [ 'pkg' ]
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
                        publishedPackages: publishedPackagesFor('pkg-a'),
                        bundleNames: [ 'pkg-a', 'pkg-b' ]
                    });
                },
                /Published package missing for "pkg-b"/u
            );
        });
    });
});
