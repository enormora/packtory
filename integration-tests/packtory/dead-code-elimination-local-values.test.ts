import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { assertValidDeadCodeEliminationOutput } from '../../source/test-libraries/dead-code-elimination-invariant-assertions.ts';
import { runNodeProbe } from '../../source/test-libraries/run-node-probe.ts';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../source/test-libraries/typescript-project.ts';
import type { AnalyzedBundle } from '../../source/dead-code-eliminator/analyzed-bundle.ts';
import { observeEmittedPackageExports } from './emitted-package-probe.ts';

async function resolveFixtureBundle(fixturePath: string, entryPath: string): Promise<AnalyzedBundle> {
    const outcome = await resolveAndLinkAll({
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'source'),
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: [ { name: 'package', roots: { main: { javaScript: entryPath } } } ]
    });
    if (!outcome.result.isOk) {
        assert.fail(JSON.stringify(outcome.result.error));
    }
    const [ resolvedPackage ] = outcome.result.value;
    assertDefined(resolvedPackage);
    return resolvedPackage.analyzedBundle;
}

suite('dead-code-elimination local values', function () {
    test('evaluates recursion through derived imports and a default namespace in the production pipeline', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-local-values');
        const entryPath = path.join(fixturePath, 'source/index.js');
        const original = await runNodeProbe(`
            const module = await import(${JSON.stringify(entryPath)});
            console.log(JSON.stringify(module));
        `);
        assert.deepStrictEqual(original, { value: 55 });
        const bundle = await resolveFixtureBundle(fixturePath, entryPath);
        assertValidDeadCodeEliminationOutput('local value propagation', [ bundle ]);
        assert.deepStrictEqual(await observeEmittedPackageExports(bundle, 'index.js'), original);
        const calls = bundle.contents.flatMap(function (resource) {
            return createProject()
                .createSourceFile(
                    resource.fileDescription.targetFilePath,
                    resource.fileDescription.content
                )
                .getDescendants()
                .filter(function (node) {
                    return node.getKindName() === 'CallExpression';
                });
        });
        assert.strictEqual(calls.length, 0);
    });
});
