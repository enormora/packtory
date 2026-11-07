import assert from 'node:assert';
import path from 'node:path';
import { pathToFileURL as pathToFileAddress } from 'node:url';
import { suite, test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import type { ResolvedPackage } from '../../source/packtory/resolved-package.ts';
import { assertValidDeadCodeEliminationOutput } from '../../source/test-libraries/dead-code-elimination-invariant-assertions.ts';
import { runNodeProbe } from '../../source/test-libraries/run-node-probe.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { observeEmittedPackageExports } from './emitted-package-probe.ts';

async function resolveFixturePackage(fixturePath: string, hasDeclarationCompanions: boolean): Promise<ResolvedPackage> {
    const outcome = await resolveAndLinkAll({
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'source'),
            mainPackageManifest: await loadPackageManifest(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [ {
            name: 'package',
            roots: {
                main: {
                    javaScript: path.join(fixturePath, 'source/index.js'),
                    declarationFile: hasDeclarationCompanions ? path.join(fixturePath, 'source/index.d.ts') : undefined
                }
            }
        } ]
    });
    if (!outcome.result.isOk) {
        assert.fail(JSON.stringify(outcome.result.error));
    }
    const [ resolvedPackage ] = outcome.result.value;
    assert.ok(resolvedPackage !== undefined);
    return resolvedPackage;
}

suite('dead-code-elimination namespace default export', function () {
    for (
        const scenario of [
            { name: 'JavaScript only', suffix: '' },
            { name: 'declaration companions', suffix: '-declarations' }
        ]
    ) {
        test(`preserves a namespace default export with ${scenario.name}`, async function () {
            const fixturePath = path.join(
                process.cwd(),
                `integration-tests/fixtures/dead-code-elimination-namespace-default${scenario.suffix}`
            );
            const entryPath = path.join(fixturePath, 'source/index.js');
            const original = await runNodeProbe(`
                const module = await import(${JSON.stringify(pathToFileAddress(entryPath).href)});
                console.log(JSON.stringify(module));
            `);
            assert.deepStrictEqual(original, { value: 42 });
            const resolvedPackage = await resolveFixturePackage(fixturePath, scenario.suffix !== '');
            if (scenario.suffix !== '') {
                assert.ok(resolvedPackage.analyzedBundle.contents.some(function (resource) {
                    return resource.fileDescription.targetFilePath === 'barrel.d.ts';
                }));
            }

            assertValidDeadCodeEliminationOutput('namespace default export', [ resolvedPackage.analyzedBundle ]);
            assert.deepStrictEqual(
                await observeEmittedPackageExports(resolvedPackage.analyzedBundle, 'index.js'),
                original
            );
        });
    }
});
