import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';

suite('package-json-imports', function () {
    test('resolves package.json#imports from mainPackageJson and emits only surviving non-substituted entries', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/package-json-imports');
        const sourcesFolder = path.join(fixture, 'src');
        const mainPackageJson = {
            type: 'module' as const,
            imports: {
                '#shared': './shared.js',
                '#local': './local.js'
            }
        };

        const firstBundle = await packageProcessor.build({
            name: 'first',
            version: '1.2.3',
            sourcesFolder,
            roots: { main: { js: path.join(sourcesFolder, 'entry-first.js') } },
            mainPackageJson,
            includeSourceMapFiles: false,
            additionalFiles: [],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        const secondBundle = await packageProcessor.build({
            name: 'second',
            version: '2.3.4',
            sourcesFolder,
            roots: { main: { js: path.join(sourcesFolder, 'entry-second.js') } },
            mainPackageJson,
            includeSourceMapFiles: false,
            additionalFiles: [],
            bundleDependencies: [firstBundle],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(firstBundle.packageJson.imports, {
            '#shared': './shared.js'
        });
        assert.deepStrictEqual(secondBundle.packageJson.imports, {
            '#local': './local.js'
        });
        assert.deepStrictEqual(secondBundle.packageJson.dependencies, {
            first: '1.2.3'
        });

        const rewrittenEntry = secondBundle.contents.find((resource) => {
            return resource.fileDescription.targetFilePath === 'entry-second.js';
        });
        if (rewrittenEntry === undefined) {
            assert.fail('Expected entry-second.js to be present in the second bundle');
        }

        assert.strictEqual(
            rewrittenEntry.fileDescription.content,
            "export { shared } from 'first/shared.js';\nexport { local } from '#local';\n"
        );
    });
});
