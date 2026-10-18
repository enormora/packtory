import assert from 'node:assert';
import { suite, test } from 'mocha';
import { emptyCheckContext } from '../../test-libraries/check-fixtures.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    analyzedBundle,
    analyzedBundleResource,
    versionedBundleWithManifest
} from '../../test-libraries/bundle-fixtures.ts';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { noUnexposedExecutablesRule } from './no-unexposed-executables.ts';

type RuleSettings = {
    readonly noUnexposedExecutables: { readonly enabled: boolean; };
};

type ExecutableField = Readonly<Record<string, string | undefined>> | string | undefined;

const enabledSettings: RuleSettings = { noUnexposedExecutables: { enabled: true } };

function packagedFile(
    inputFilePath: string,
    targetFilePath: string,
    isExecutable: boolean
): AnalyzedBundleResource {
    const base = analyzedBundleResource(inputFilePath, { targetFilePath });
    return {
        ...base,
        fileDescription: {
            ...base.fileDescription,
            isExecutable
        }
    };
}

function packageBundle(name: string, contents: readonly AnalyzedBundleResource[]): AnalyzedBundle {
    return analyzedBundle({ name, contents });
}

function publishedPackage(
    name: string,
    executableField: ExecutableField
): PublishedPackageWithManifest {
    return versionedBundleWithManifest({ name, executableField });
}

function publishedPackages(
    packages: readonly PublishedPackageWithManifest[]
): ReadonlyMap<string, PublishedPackageWithManifest> {
    return new Map(
        packages.map(function (packageEntry) {
            return [ packageEntry.name, packageEntry ] as const;
        })
    );
}

async function checkBundlesWithSettings(
    bundles: readonly AnalyzedBundle[],
    packages: ReadonlyMap<string, PublishedPackageWithManifest>,
    settings: RuleSettings
): Promise<readonly string[]> {
    return await noUnexposedExecutablesRule.run({
        bundles,
        publishedPackages: packages,
        settings,
        ...emptyCheckContext()
    });
}

async function checkBundles(
    bundles: readonly AnalyzedBundle[],
    packages: ReadonlyMap<string, PublishedPackageWithManifest>
): Promise<readonly string[]> {
    return await checkBundlesWithSettings(bundles, packages, enabledSettings);
}

suite('no-unexposed-executables', function () {
    test('exposes the rule contract', function () {
        assert.strictEqual(noUnexposedExecutablesRule.name, 'noUnexposedExecutables');
        assert.strictEqual(typeof noUnexposedExecutablesRule.run, 'function');
        assert.strictEqual(noUnexposedExecutablesRule.globalSchema.safeParse({ enabled: true }).success, true);
        assert.strictEqual(noUnexposedExecutablesRule.perPackageSchema.safeParse({}).success, true);
    });

    test('does not report when the rule is disabled', async function () {
        const issues = await checkBundlesWithSettings(
            [ packageBundle('package', [ packagedFile('/repo/source/hidden.js', 'hidden.js', true) ]) ],
            publishedPackages([ publishedPackage('package', undefined) ]),
            { noUnexposedExecutables: { enabled: false } }
        );

        assert.deepStrictEqual(issues, []);
    });

    test('does not report when check settings are absent', async function () {
        const issues = await noUnexposedExecutablesRule.run({
            bundles: [ packageBundle('package', [ packagedFile('/repo/source/hidden.js', 'hidden.js', true) ]) ],
            publishedPackages: publishedPackages([ publishedPackage('package', undefined) ]),
            settings: undefined,
            ...emptyCheckContext()
        });

        assert.deepStrictEqual(issues, []);
    });

    test('throws when enabled without generated packages', async function () {
        await assert.rejects(
            async function () {
                await noUnexposedExecutablesRule.run({
                    bundles: [],
                    publishedPackages: undefined,
                    settings: enabledSettings,
                    ...emptyCheckContext()
                });
            },
            { message: 'Published packages missing for unexposed executable checks' }
        );
    });

    test('throws when a generated package is missing for a bundle', async function () {
        await assert.rejects(
            async function () {
                await checkBundles([ packageBundle('package', []) ], publishedPackages([]));
            },
            { message: 'Published package missing for "package"' }
        );
    });

    test('does not report non-executable files', async function () {
        const issues = await checkBundles(
            [ packageBundle('package', [ packagedFile('/repo/source/index.js', 'index.js', false) ]) ],
            publishedPackages([ publishedPackage('package', undefined) ])
        );

        assert.deepStrictEqual(issues, []);
    });

    test('reports an executable file that is not a bin target', async function () {
        const issues = await checkBundles(
            [ packageBundle('package', [ packagedFile('/repo/source/hidden.js', 'hidden.js', true) ]) ],
            publishedPackages([ publishedPackage('package', undefined) ])
        );

        assert.deepStrictEqual(issues, [
            'Package "package" ships executable file "hidden.js" from "/repo/source/hidden.js" that is not exposed through bin'
        ]);
    });

    test('does not report an executable implicit bin target', async function () {
        const issues = await checkBundles(
            [ packageBundle('package', [ packagedFile('/repo/source/cli.js', 'cli.js', true) ]) ],
            publishedPackages([ publishedPackage('package', { package: './cli.js' }) ])
        );

        assert.deepStrictEqual(issues, []);
    });

    test('does not report an executable explicit bin target', async function () {
        const issues = await checkBundles(
            [ packageBundle('package', [ packagedFile('/repo/source/run.js', 'commands/run.js', true) ]) ],
            publishedPackages([ publishedPackage('package', { 'run-pkg': './commands/run.js' }) ])
        );

        assert.deepStrictEqual(issues, []);
    });

    test('reports independently per package', async function () {
        const issues = await checkBundles(
            [
                packageBundle('package-a', [ packagedFile('/repo/a/hidden.js', 'hidden.js', true) ]),
                packageBundle('package-b', [ packagedFile('/repo/b/cli.js', 'cli.js', true) ])
            ],
            publishedPackages([
                publishedPackage('package-a', undefined),
                publishedPackage('package-b', { 'package-b': './cli.js' })
            ])
        );

        assert.deepStrictEqual(issues, [
            [
                'Package "package-a" ships executable file "hidden.js" from "/repo/a/hidden.js" ',
                'that is not exposed through bin'
            ]
                .join('')
        ]);
    });
});
