/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unnecessary-condition -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ConfigWithGraph } from '../config/validation.ts';
import type { PacktoryConfigWithoutRegistry } from '../config/config.ts';
import { checkBundle } from '../test-libraries/check-bundle-fixture.ts';
import { buildChecksResult, createResolvedPackage, type ResolvedPackage } from './resolved-package.ts';

function validated(config: Partial<PacktoryConfigWithoutRegistry>): ConfigWithGraph<PacktoryConfigWithoutRegistry> {
    return { packtoryConfig: { packages: [], ...config } } as unknown as ConfigWithGraph<PacktoryConfigWithoutRegistry>;
}

suite('resolved-package', function () {
    test('createResolvedPackage assembles the three fields into a ResolvedPackage', function () {
        const analyzedBundle = { name: 'pkg-a' } as never;
        const resolveOptions = { name: 'pkg-a' } as never;

        assert.deepStrictEqual(createResolvedPackage('pkg-a', analyzedBundle, resolveOptions), {
            name: 'pkg-a',
            analyzedBundle,
            resolveOptions
        });
    });

    test('buildChecksResult returns an Ok holding the resolved packages when no checks are configured', function () {
        const resolvedPackages: readonly ResolvedPackage[] = [];

        const result = buildChecksResult(validated({}), resolvedPackages);

        assert.strictEqual(result.isOk, true);
        if (result.isOk) {
            assert.strictEqual(result.value, resolvedPackages);
        }
    });

    test('buildChecksResult returns a checks failure carrying every issue produced by a configured rule', function () {
        const resolvedPackages = [
            { name: 'pkg-a', analyzedBundle: checkBundle('pkg-a', ['shared.ts']), resolveOptions: {} as never },
            { name: 'pkg-b', analyzedBundle: checkBundle('pkg-b', ['shared.ts']), resolveOptions: {} as never }
        ];

        const result = buildChecksResult(
            validated({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [{ name: 'pkg-a', roots: {} } as never, { name: 'pkg-b', roots: {} } as never]
            }),
            resolvedPackages
        );

        assert.strictEqual(result.isErr, true);
        if (result.isErr) {
            assert.deepStrictEqual(result.error, {
                type: 'checks',
                issues: ['File "shared.ts" is included in multiple packages: pkg-a, pkg-b']
            });
        }
    });

    test('buildChecksResult threads per-package check settings to the runner so cross-package consent suppresses issues', function () {
        const resolvedPackages = [
            { name: 'pkg-a', analyzedBundle: checkBundle('pkg-a', ['shared.ts']), resolveOptions: {} as never },
            { name: 'pkg-b', analyzedBundle: checkBundle('pkg-b', ['shared.ts']), resolveOptions: {} as never }
        ];
        const consent = { noDuplicatedFiles: { allowList: ['shared.ts'] } };

        const result = buildChecksResult(
            validated({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [
                    { name: 'pkg-a', roots: {}, checks: consent } as never,
                    { name: 'pkg-b', roots: {}, checks: consent } as never
                ]
            }),
            resolvedPackages
        );

        assert.strictEqual(result.isOk, true);
    });

    test('buildChecksResult falls back to commonPackageSettings.mainPackageJson when the package does not override it', function () {
        const bundle = {
            ...checkBundle('pkg-a', ['shared.ts']),
            externalDependencies: new Map([['runtime-dep', { name: 'runtime-dep', referencedFrom: ['/x'] }]])
        };

        const result = buildChecksResult(
            validated({
                commonPackageSettings: {
                    mainPackageJson: { type: 'module', dependencies: { 'runtime-dep': '1.0.0' } }
                },
                checks: { noDevDependencyImports: { enabled: true } },
                packages: [{ name: 'pkg-a', roots: {} } as never]
            }),
            [{ name: 'pkg-a', analyzedBundle: bundle as never, resolveOptions: {} as never }]
        );

        assert.strictEqual(result.isOk, true);
    });

    test('buildChecksResult flags a dev-only import detected through the common mainPackageJson fallback', function () {
        const bundle = {
            ...checkBundle('pkg-a', ['shared.ts']),
            externalDependencies: new Map([['dev-dep', { name: 'dev-dep', referencedFrom: ['/x'] }]])
        };

        const result = buildChecksResult(
            validated({
                commonPackageSettings: {
                    mainPackageJson: { type: 'module', devDependencies: { 'dev-dep': '1.0.0' } }
                },
                checks: { noDevDependencyImports: { enabled: true } },
                packages: [{ name: 'pkg-a', roots: {} } as never]
            }),
            [{ name: 'pkg-a', analyzedBundle: bundle as never, resolveOptions: {} as never }]
        );

        assert.strictEqual(result.isErr, true);
        if (result.isErr) {
            assert.deepStrictEqual(result.error, {
                type: 'checks',
                issues: [
                    'Package "pkg-a" imports "dev-dep" which is only declared in devDependencies of the main package.json'
                ]
            });
        }
    });

    test('buildChecksResult prefers the package-level mainPackageJson over commonPackageSettings.mainPackageJson', function () {
        const bundle = {
            ...checkBundle('pkg-a', ['shared.ts']),
            externalDependencies: new Map([['runtime-dep', { name: 'runtime-dep', referencedFrom: ['/x'] }]])
        };

        const result = buildChecksResult(
            validated({
                commonPackageSettings: {
                    mainPackageJson: { type: 'module', devDependencies: { 'runtime-dep': '1.0.0' } }
                },
                checks: { noDevDependencyImports: { enabled: true } },
                packages: [
                    {
                        name: 'pkg-a',
                        roots: {},
                        mainPackageJson: { type: 'module', dependencies: { 'runtime-dep': '1.0.0' } }
                    } as never
                ]
            }),
            [{ name: 'pkg-a', analyzedBundle: bundle as never, resolveOptions: {} as never }]
        );

        assert.strictEqual(result.isOk, true);
    });
});
