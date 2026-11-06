import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { assertValidDeadCodeEliminationOutput } from '../../source/test-libraries/dead-code-elimination-invariant-assertions.ts';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { observeEmittedPackageExports } from './emitted-package-probe.ts';

suite('dead-code-elimination star reexports', function () {
    test('preserves unique public exports and ambiguity through the production pipeline', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-star-reexports');
        const outcome = await resolveAndLinkAll({
            commonPackageSettings: {
                sourcesFolder: path.join(fixturePath, 'source'),
                mainPackageManifest: await loadPackageManifest(fixturePath),
                publishSettings: { access: 'public' }
            },
            packages: [ {
                name: 'package',
                roots: { main: { javaScript: path.join(fixturePath, 'source/index.js') } }
            } ]
        });
        if (!outcome.result.isOk) {
            assert.fail(JSON.stringify(outcome.result.error));
        }
        const [ resolvedPackage ] = outcome.result.value;
        assertDefined(resolvedPackage);

        assertValidDeadCodeEliminationOutput('star reexports', [ resolvedPackage.analyzedBundle ]);
        assert.deepStrictEqual(
            await observeEmittedPackageExports(resolvedPackage.analyzedBundle, 'index.js'),
            { a: 1, b: 2, value: 42 }
        );
    });
});
