import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { importEmittedPackageEntryWithProjectDependencies } from './emitted-package-probe.ts';

suite('external dependency purity in prepared packages', function () {
    test('removes unused Zod builders through the full pipeline and imports the resulting package', async function () {
        const fixturePath = path.join(
            process.cwd(),
            'integration-tests/fixtures/dead-code-elimination-external-purity'
        );
        const outcome = await resolveAndLinkAll({
            commonPackageSettings: {
                sourcesFolder: path.join(fixturePath, 'source'),
                mainPackageManifest: await loadPackageManifest(fixturePath),
                publishSettings: { access: 'public' }
            },
            packages: [ { name: 'package', roots: { main: { javaScript: 'index.js' } } } ]
        });

        assert.ok(outcome.result.isOk);
        const [ prepared ] = outcome.result.value;
        assertDefined(prepared);
        const [ entry ] = prepared.analyzedBundle.contents;
        assertDefined(entry);
        assert.strictEqual(entry.fileDescription.content.includes('unusedSchema'), false);
        assert.strictEqual(entry.fileDescription.content.includes('export function api()'), true);
        await importEmittedPackageEntryWithProjectDependencies(prepared.analyzedBundle, 'index.js');
    });
});
