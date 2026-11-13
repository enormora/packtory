import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    withCompilerWorkspace,
    createProjectWithUntrackedInputs,
    type CompilerWorkspace
} from '../../test-libraries/compiler-workspace.ts';
import { checkPublishedPackage } from '../../test-libraries/check-fixtures.ts';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { createDeclarationValidation, type DeclarationValidation } from './declaration-validation.ts';

const manifest = '{"name":"example","version":"1.0.0","types":"./index.d.ts"}';
type ValidationFixture = {
    readonly workspace: CompilerWorkspace;
    readonly published: PublishedPackageWithManifest;
    readonly packages: ReadonlyMap<string, PublishedPackageWithManifest>;
    readonly validate: DeclarationValidation;
    readonly create: () => DeclarationValidation;
};
async function withValidation(run: (fixture: ValidationFixture) => Promise<void>): Promise<void> {
    await withCompilerWorkspace(async function (workspace) {
        const published = checkPublishedPackage('example', manifest, {
            'index.d.ts': 'export declare const value: number;'
        });
        const dependencies = { ...workspace, packageResolutionBaseFolder: workspace.folder };
        await run({
            workspace,
            published,
            packages: new Map([ [ 'example', published ] ]),
            validate: createDeclarationValidation(dependencies),
            create() {
                return createDeclarationValidation(dependencies);
            }
        });
    });
}
function assertDiagnostic(issues: readonly string[], code: string): void {
    assert.strictEqual(issues.length, 2);
    assert.ok(issues.every(function (issue) {
        return issue.includes(code);
    }));
}

suite('reusable declaration validation', function () {
    test('recomputes unsupported compiler observations without persisting them', async function () {
        await withValidation(async function (fixture) {
            let writes = 0;
            const validate = createDeclarationValidation({
                ...fixture.workspace,
                packageResolutionBaseFolder: fixture.workspace.folder,
                Project: createProjectWithUntrackedInputs(fixture.workspace.Project),
                storage: {
                    read: fixture.workspace.storage.read,
                    async write() {
                        writes += 1;
                        return true;
                    }
                }
            });
            assert.deepStrictEqual(await validate('example', fixture.published, 'all', fixture.packages), []);
            assert.deepStrictEqual(await validate('example', fixture.published, 'all', fixture.packages), []);
            assert.strictEqual(fixture.workspace.projectCount(), 4);
            assert.strictEqual(writes, 0);
        });
    });

    test('reuses validation across independent instances', async function () {
        await withValidation(async function (fixture) {
            assert.deepStrictEqual(await fixture.validate('example', fixture.published, 'all', fixture.packages), []);
            assert.deepStrictEqual(
                await fixture.create()('example', fixture.published, 'all', new Map(fixture.packages)),
                []
            );
            assert.strictEqual(fixture.workspace.projectCount(), 2);
        });
    });

    test('rejects changed declaration contents', async function () {
        await withValidation(async function (fixture) {
            assert.deepStrictEqual(await fixture.validate('example', fixture.published, 'all', fixture.packages), []);
            const changed = checkPublishedPackage('example', manifest, {
                'index.d.ts': 'export declare const value: Missing;'
            });
            assertDiagnostic(
                await fixture.validate('example', changed, 'all', new Map([ [ 'example', changed ] ])),
                'TS2304'
            );
            assert.strictEqual(fixture.workspace.projectCount(), 4);
        });
    });

    test('observes changed external types even when callers reuse the same package map', async function () {
        await withValidation(async function (fixture) {
            await fixture.workspace.write(
                'node_modules/external/package.json',
                '{"name":"external","version":"1.0.0","types":"index.d.ts"}'
            );
            await fixture.workspace.write('node_modules/external/index.d.ts', 'export type External = number;');
            const published = checkPublishedPackage('example', manifest, {
                'index.d.ts': 'import type { External } from "external"; export declare const value: External;'
            });
            const packages = new Map([ [ 'example', published ] ]);
            assert.deepStrictEqual(await fixture.validate('example', published, 'all', packages), []);
            await fixture.workspace.write('node_modules/external/index.d.ts', 'export type Renamed = number;');
            assertDiagnostic(await fixture.validate('example', published, 'all', packages), 'TS2305');
        });
    });

    test('preserves the distinction between all declarations and the exports graph', async function () {
        await withValidation(async function (fixture) {
            const published = checkPublishedPackage('example', manifest, {
                'index.d.ts': 'export declare const value: number;',
                'private.d.ts': 'export declare const broken: Missing;'
            });
            const packages = new Map([ [ 'example', published ] ]);
            assertDiagnostic(await fixture.validate('example', published, 'all', packages), 'TS2304');
            assert.deepStrictEqual(await fixture.validate('example', published, 'exports-graph', packages), []);
            assertDiagnostic(await fixture.validate('example', published, 'all', packages), 'TS2304');
            assert.strictEqual(fixture.workspace.projectCount(), 2);
        });
    });

    test('observes a replaced sibling in the same resolution map', async function () {
        await withValidation(async function (fixture) {
            const published = checkPublishedPackage('example', manifest, {
                'index.d.ts': 'export type { Value } from "sibling";'
            });
            const sibling = checkPublishedPackage('sibling', '{"name":"sibling","types":"index.d.ts"}', {
                'index.d.ts': 'export type Value = number;'
            });
            const packages = new Map([ [ 'example', published ], [ 'sibling', sibling ] ]);
            assert.deepStrictEqual(await fixture.validate('example', published, 'all', packages), []);
            packages.set(
                'sibling',
                checkPublishedPackage('sibling', sibling.manifestFile.content, {
                    'index.d.ts': 'export type Renamed = number;'
                })
            );
            assertDiagnostic(await fixture.validate('example', published, 'all', packages), 'TS2305');
        });
    });
});
