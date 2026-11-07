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

suite('dead-code-elimination direct eval', function () {
    test('preserves eval lexical bindings and imported values through the production pipeline', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-direct-eval');
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
        const expected = {
            hidden: 7,
            nested: 10,
            counter: 1,
            imported: 28,
            namespace: [ 'default', 'other', 'value' ],
            namespaceValue: 13,
            indirect: 'undefined'
        };

        assertValidDeadCodeEliminationOutput('direct eval', [ resolvedPackage.analyzedBundle ]);
        assert.deepStrictEqual(
            await Promise.all([
                runNodeProbe(`
                    const module = await import(${JSON.stringify(pathToFileAddress(entryPath).href)});
                    console.log(JSON.stringify(module.api()));
                `),
                runEmittedPackageApplicationProgrammingInterface(resolvedPackage, 'index.js')
            ]),
            [ expected, expected ]
        );
    });
});
