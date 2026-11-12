import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Package } from '@arethetypeswrong/core';
import { problemKindInfo as problemKindInformation } from '@arethetypeswrong/core/problems';
import { withCompilerWorkspace } from '../../test-libraries/compiler-workspace.ts';
import { checkPublishedPackage } from '../../test-libraries/check-fixtures.ts';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import type { AnalysisStorage } from '../analysis-storage.ts';
import { createPackageResolutionAnalyzer, type PackageResolutionAnalyzer } from './type-script-package-resolution.ts';

function analyzer(storage: AnalysisStorage, checkPackage: SinonSpy): PackageResolutionAnalyzer {
    return createPackageResolutionAnalyzer({
        storage,
        Package,
        checkPackage,
        problemKindInformation,
        problemAffectsResolutionKind: fake.returns(true),
        problemAffectsEntrypointResolution: fake.returns(true)
    });
}

type DiagnosticFixture = {
    readonly checkPackage: SinonSpy;
    readonly published: PublishedPackageWithManifest;
    readonly validate: PackageResolutionAnalyzer;
};

function diagnosticFixture(storage: AnalysisStorage): DiagnosticFixture {
    const checkPackage = fake.resolves({
        types: { kind: 'included' },
        entrypoints: { '.': {} },
        problems: [ { kind: 'FalseCJS' } ]
    });
    return {
        checkPackage,
        published: checkPublishedPackage('example', '{"name":"example"}', {
            'index.d.ts': 'export const value: number;'
        }),
        validate: analyzer(storage, checkPackage)
    };
}

suite('package resolution reuse', function () {
    for (const resolutionKind of [ 'node10', 'node16-cjs', 'node16-esm', 'bundler' ] as const) {
        test(`reuses diagnostics for ${resolutionKind}`, async function () {
            await withCompilerWorkspace(async function (workspace) {
                const { checkPackage, published, validate } = diagnosticFixture(workspace.storage);
                const first = await validate(published, [ resolutionKind ]);
                assert.deepStrictEqual(await validate(published, [ resolutionKind ]), first);
                assert.strictEqual(checkPackage.callCount, 1);
            });
        });
    }

    for (const kind of [ 'UnknownKind', [ 'FalseCJS' ] ]) {
        test(`rejects incompatible cached diagnostic kinds: ${JSON.stringify(kind)}`, async function () {
            await withCompilerWorkspace(async function (workspace) {
                const checkPackage = fake.resolves({ types: false });
                const storage: AnalysisStorage = {
                    async read(key, schema) {
                        await workspace.storage.write(key, {
                            kind: 'analyzed',
                            entrypoints: [ '.' ],
                            problems: [ {
                                kind,
                                shortDescription: 'invalid',
                                affectedResolutionKinds: [ 'bundler' ],
                                affectedEntrypoints: [ '.' ]
                            } ]
                        });
                        return workspace.storage.read(key, schema);
                    },
                    write: workspace.storage.write
                };
                const published = checkPublishedPackage('example', '{"name":"example"}', {
                    'index.js': 'export const value = 1;'
                });
                assert.deepStrictEqual(await analyzer(storage, checkPackage)(published, [ 'bundler' ]), {
                    kind: 'missing-declarations'
                });
                assert.strictEqual(checkPackage.callCount, 1);
            });
        });
    }

    test('reuses complete reports and invalidates changed package contents', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const checkPackage = fake.resolves({ types: false });
            const published = checkPublishedPackage('example', '{"name":"example"}', {
                'index.js': 'export const value = 1;'
            });
            const first = await analyzer(workspace.storage, checkPackage)(published, [ 'bundler' ]);
            assert.deepStrictEqual(await analyzer(workspace.storage, checkPackage)(published, [ 'bundler' ]), first);
            assert.strictEqual(checkPackage.callCount, 1);
            const changed = checkPublishedPackage('example', '{"name":"example"}', {
                'index.js': 'export const value = 2;'
            });
            assert.deepStrictEqual(await analyzer(workspace.storage, checkPackage)(changed, [ 'bundler' ]), first);
            assert.strictEqual(checkPackage.callCount, 2);
        });
    });

    test('keeps resolution modes and all diagnostics in cached reports', async function () {
        await withCompilerWorkspace(async function (workspace) {
            const { checkPackage, published, validate } = diagnosticFixture(workspace.storage);
            const first = await validate(published, [ 'node16-esm' ]);
            assert.deepStrictEqual(await validate(published, [ 'node16-esm' ]), first);
            assert.strictEqual(checkPackage.callCount, 1);
            assert.notDeepStrictEqual(await validate(published, [ 'bundler' ]), first);
            assert.strictEqual(checkPackage.callCount, 2);
        });
    });
});
