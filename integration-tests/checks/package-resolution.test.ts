import assert from 'node:assert';
import { suite, test } from 'mocha';
import { checkPackage, Package, type ResolutionKind } from '@arethetypeswrong/core';
import {
    problemAffectsEntrypointResolution,
    problemAffectsResolutionKind,
    problemKindInfo
} from '@arethetypeswrong/core/problems';
import { createPackageResolutionAnalyzer } from '../../source/checks/rules/type-script-package-resolution.ts';
import { summarizeResolutionReport } from '../../source/checks/rules/type-script-resolution-summary.ts';
import type { PublishedPackageWithManifest } from '../../source/published-package/published-package.ts';
import { manifest, publishedPackage } from './published-package-fixtures.ts';

const checkedResolutionKinds: readonly ResolutionKind[] = [ 'node16-esm', 'bundler' ];

const analyzePackageResolution = createPackageResolutionAnalyzer({
    Package,
    checkPackage,
    problemKindInfo,
    problemAffectsResolutionKind,
    problemAffectsEntrypointResolution
});

async function checkPackageResolution(
    publishedPackageToCheck: PublishedPackageWithManifest
): Promise<readonly string[]> {
    const report = await analyzePackageResolution(publishedPackageToCheck, checkedResolutionKinds);
    return summarizeResolutionReport(publishedPackageToCheck.name, report, checkedResolutionKinds);
}

const rootExports = {
    exports: {
        '.': {
            import: './index.js',
            types: './index.d.ts'
        }
    }
};

type EntrypointSources = {
    readonly javascriptSource: string;
    readonly declarationSource: string;
};

const brokenCommonJsEntrypoint: EntrypointSources = {
    javascriptSource: 'module.exports = function value() {};\nmodule.exports.default = module.exports;\n',
    declarationSource: 'declare function value(): void;\nexport default value;\n'
};

function typedPackage(packageName: string, entrypoint: EntrypointSources): PublishedPackageWithManifest {
    return publishedPackage(packageName, manifest(packageName, rootExports), {
        'index.js': entrypoint.javascriptSource,
        'index.d.ts': entrypoint.declarationSource
    });
}

function twoEntrypointPackage(
    packageName: string,
    rootEntrypoint: EntrypointSources,
    featureEntrypoint: EntrypointSources
): PublishedPackageWithManifest {
    return publishedPackage(
        packageName,
        manifest(packageName, {
            exports: {
                '.': { import: './index.js', types: './index.d.ts' },
                './feature': { import: './feature.js', types: './feature.d.ts' }
            }
        }),
        {
            'index.js': rootEntrypoint.javascriptSource,
            'index.d.ts': rootEntrypoint.declarationSource,
            'feature.js': featureEntrypoint.javascriptSource,
            'feature.d.ts': featureEntrypoint.declarationSource
        }
    );
}

suite('package resolution against the real types checker', function () {
    test('reports no issues for a valid ESM-only package', async function () {
        const issues = await checkPackageResolution(typedPackage('esm-only-package', {
            javascriptSource: 'export const value = 1;\n',
            declarationSource: 'export declare const value: number;\n'
        }));

        assert.deepStrictEqual(issues, []);
    });

    test('reports resolution problems without exposing the internal checker name', async function () {
        const issues = await checkPackageResolution(typedPackage('broken-package', brokenCommonJsEntrypoint));

        assert.deepStrictEqual(issues, [
            'Package "broken-package" failed TypeScript integrity: Missing `export =` ' +
            'affecting entrypoints "." in resolutions "bundler"',
            'Package "broken-package" failed TypeScript integrity: Unexpected module syntax ' +
            'affecting entrypoints "." in resolutions "node16-esm"'
        ]);
    });

    test('groups a repeated problem kind of several entrypoints into one summary', async function () {
        const issues = await checkPackageResolution(twoEntrypointPackage(
            'multi-entrypoint-package',
            brokenCommonJsEntrypoint,
            {
                javascriptSource: 'module.exports = function feature() {};\nmodule.exports.default = module.exports;\n',
                declarationSource: 'declare function feature(): void;\nexport default feature;\n'
            }
        ));

        assert.deepStrictEqual(issues, [
            'Package "multi-entrypoint-package" failed TypeScript integrity: Missing `export =` (2 findings) ' +
            'affecting entrypoints ".", "./feature" in resolutions "bundler"',
            'Package "multi-entrypoint-package" failed TypeScript integrity: Unexpected module syntax (2 findings) ' +
            'affecting entrypoints ".", "./feature" in resolutions "node16-esm"'
        ]);
    });

    test('reports only the entrypoints a problem affects', async function () {
        const issues = await checkPackageResolution(twoEntrypointPackage(
            'mixed-entrypoint-package',
            brokenCommonJsEntrypoint,
            {
                javascriptSource: 'export const feature = 1;\n',
                declarationSource: 'export declare const feature: number;\n'
            }
        ));

        assert.deepStrictEqual(issues, [
            'Package "mixed-entrypoint-package" failed TypeScript integrity: Missing `export =` ' +
            'affecting entrypoints "." in resolutions "bundler"',
            'Package "mixed-entrypoint-package" failed TypeScript integrity: Unexpected module syntax ' +
            'affecting entrypoints "." in resolutions "node16-esm"'
        ]);
    });

    test('reports a package that exposes no declarations', async function () {
        const issues = await checkPackageResolution(publishedPackage(
            'untyped-package',
            manifest('untyped-package', { exports: { '.': './index.js' } }),
            { 'index.js': 'export const value = 1;\n' }
        ));

        assert.deepStrictEqual(issues, [ 'Package "untyped-package" does not expose TypeScript declarations' ]);
    });

    test('fails when the generated package manifest is missing', async function () {
        const packageWithoutManifest = {
            ...typedPackage('throwing-package', {
                javascriptSource: 'export const value = 1;\n',
                declarationSource: 'export declare const value: number;\n'
            }),
            manifestFile: {
                filePath: 'manifest.json',
                content: manifest('throwing-package', rootExports),
                isExecutable: false
            }
        };

        await assert.rejects(
            async function () {
                await checkPackageResolution(packageWithoutManifest);
            },
            /File not found: \/node_modules\/throwing-package\/package\.json/u
        );
    });
});
