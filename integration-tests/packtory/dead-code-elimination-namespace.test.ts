import assert from 'node:assert';
import path from 'node:path';
import { pathToFileURL as pathToFileAddress } from 'node:url';
import { suite, test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { assertValidDeadCodeEliminationOutput } from '../../source/test-libraries/dead-code-elimination-invariant-assertions.ts';
import { runNodeProbe } from '../../source/test-libraries/run-node-probe.ts';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { runEmittedPackageApplicationProgrammingInterface } from './emitted-package-probe.ts';

const expected = {
    value: 1,
    keys: [ 'increment', 'other', 'value' ],
    ownKeys: [ 'increment', 'other', 'value', 'Symbol(Symbol.toStringTag)' ],
    escaped: [ [ 'increment', 'other', 'value' ], 9 ]
};

suite('dead-code-elimination namespace', function () {
    test('preserves namespace keys, values, and live bindings through the production pipeline', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-namespace');
        const entryPath = path.join(fixturePath, 'source/index.js');
        const outcome = await resolveAndLinkAll({
            commonPackageSettings: {
                sourcesFolder: path.join(fixturePath, 'source'),
                mainPackageManifest: await loadPackageManifest(fixturePath),
                publishSettings: { access: 'public' }
            },
            packages: [ {
                name: 'package',
                roots: { main: { javaScript: entryPath } }
            } ]
        });
        if (!outcome.result.isOk) {
            assert.fail(JSON.stringify(outcome.result.error));
        }
        const [ resolvedPackage ] = outcome.result.value;
        assertDefined(resolvedPackage);

        assert.deepStrictEqual(
            await runNodeProbe(`
            const module = await import(${JSON.stringify(pathToFileAddress(entryPath).href)});
            console.log(JSON.stringify(module.api()));
        `),
            expected
        );
        assertValidDeadCodeEliminationOutput('namespace observation', [ resolvedPackage.analyzedBundle ]);
        assert.deepStrictEqual(
            await runEmittedPackageApplicationProgrammingInterface(resolvedPackage, 'index.js'),
            expected
        );
    });
});
