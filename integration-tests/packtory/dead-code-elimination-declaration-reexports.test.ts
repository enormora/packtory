import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import type { ResolvedPackage } from '../../source/packtory/resolved-package.ts';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';

async function resolveFixture(entry: string): Promise<ResolvedPackage> {
    const fixturePath = path.join(
        process.cwd(),
        'integration-tests/fixtures/dead-code-elimination-declaration-reexports'
    );
    const outcome = await resolveAndLinkAll({
        checks: { typeScriptIntegrity: { enabled: true, declarations: 'all' } },
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'source'),
            mainPackageManifest: await loadPackageManifest(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [ {
            name: 'declaration-repro',
            roots: { main: { javaScript: `${entry}.js`, declarationFile: `${entry}.d.ts` } },
            defaultModuleRoot: 'main'
        } ]
    });
    if (!outcome.result.isOk) {
        assert.fail(JSON.stringify(outcome.result.error));
    }
    const [ resolvedPackage ] = outcome.result.value;
    assertDefined(resolvedPackage);
    return resolvedPackage;
}

function assertDeclarationExports(resolvedPackage: ResolvedPackage, requiresReader: boolean): void {
    const declarations = new Map(resolvedPackage.analyzedBundle.contents.map(function (resource) {
        return [ resource.fileDescription.targetFilePath, resource.fileDescription.content ];
    }));
    const barrel = declarations.get('barrel.d.ts');
    const context = declarations.get('context.d.ts');
    assertDefined(barrel);
    assertDefined(context);
    assert.match(barrel, /export type \{ Context \} from "\.\/context\.ts"/u);
    assert.match(context, /export type Context = \{ value: string \}/u);
    assert.strictEqual(barrel.includes('readContext'), requiresReader);
    assert.strictEqual(context.includes('readContext'), requiresReader);
}

suite('dead-code-elimination declaration reexports', function () {
    for (
        const scenario of [
            { entry: 'index', requiresReader: false },
            { entry: 'with-internal-value', requiresReader: false },
            { entry: 'with-typeof', requiresReader: true },
            { entry: 'with-value', requiresReader: true }
        ]
    ) {
        test(`keeps declaration reexports consistent for ${scenario.entry}`, async function () {
            const resolvedPackage = await resolveFixture(scenario.entry);
            assertDeclarationExports(resolvedPackage, scenario.requiresReader);
        });
    }
});
