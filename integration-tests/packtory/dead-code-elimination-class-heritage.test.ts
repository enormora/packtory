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

const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-class-heritage');
const entryPath = path.join(fixturePath, 'source/index.js');
const expected = [ 'TypeError', 'TypeError', 'TypeError', 'TypeError', 'TypeError', 42 ];

suite('dead-code-elimination class heritage', function () {
    test('preserves class definition exceptions through the production pipeline', async function () {
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
        const safeModule = resolvedPackage.analyzedBundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'safe.js';
        });
        assertDefined(safeModule);

        assert.strictEqual(safeModule.fileDescription.content.includes('class'), false);
        assertValidDeadCodeEliminationOutput('class heritage', [ resolvedPackage.analyzedBundle ]);
        assert.deepStrictEqual(
            await Promise.all([
                runNodeProbe(`
                    const module = await import(${JSON.stringify(pathToFileAddress(entryPath).href)});
                    console.log(JSON.stringify(await module.api()));
                `),
                runEmittedPackageApplicationProgrammingInterface(resolvedPackage, 'index.js')
            ]),
            [ expected, expected ]
        );
    });
});
