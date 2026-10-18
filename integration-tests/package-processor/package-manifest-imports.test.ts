import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';

type BuiltPackage = Awaited<ReturnType<typeof packageProcessor.build>>;

type ImportsPackageManifest = {
    readonly type: 'module';
    readonly imports: Readonly<Record<string, string>>;
};

type BuildPackageInput = {
    readonly sourcesFolder: string;
    readonly mainPackageManifest: ImportsPackageManifest;
    readonly name: string;
    readonly version: string;
    readonly entryFileName: string;
    readonly bundleDependencies: readonly BuiltPackage[];
};

async function buildPackage(input: BuildPackageInput): Promise<BuiltPackage> {
    return packageProcessor.build({
        name: input.name,
        version: input.version,
        sourcesFolder: input.sourcesFolder,
        surface: { mode: 'explicit', packageInterface: { modules: [ { export: '.', root: 'main' } ] } },
        roots: { main: { javaScript: path.join(input.sourcesFolder, input.entryFileName) } },
        mainPackageManifest: input.mainPackageManifest,
        includeSourceMapFiles: false,
        additionalFiles: [],
        bundleDependencies: input.bundleDependencies,
        bundlePeerDependencies: [],
        additionalPackageManifestAttributes: {},
        allowMutableSpecifiers: [],
        deadCodeElimination: { enabled: false }
    });
}

function findEntry(bundle: BuiltPackage, targetFilePath: string): BuiltPackage['contents'][number] {
    const entry = bundle.contents.find(function (resource) {
        return resource.fileDescription.targetFilePath === targetFilePath;
    });
    if (entry === undefined) {
        assert.fail(`Expected ${targetFilePath} to be present in the bundle`);
    }
    return entry;
}

suite('package-manifest-imports', function () {
    test('preserves package.json#imports for retained private authoring files', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/package-manifest-imports');
        const sourcesFolder = path.join(fixture, 'source');
        const mainPackageManifest = {
            type: 'module' as const,
            imports: {
                '#shared': './shared.js',
                '#local': './local.js'
            }
        };

        const firstBundle = await buildPackage({
            sourcesFolder,
            mainPackageManifest,
            name: 'first',
            version: '1.2.3',
            entryFileName: 'entry-first.js',
            bundleDependencies: []
        });
        const secondBundle = await buildPackage({
            sourcesFolder,
            mainPackageManifest,
            name: 'second',
            version: '2.3.4',
            entryFileName: 'entry-second.js',
            bundleDependencies: [ firstBundle ]
        });

        assert.deepStrictEqual(firstBundle.packageManifest.imports, {
            '#shared': './shared.js'
        });
        assert.partialDeepStrictEqual(secondBundle, {
            packageManifest: {
                imports: {
                    '#shared': './shared.js',
                    '#local': './local.js'
                }
            }
        });
        assert.strictEqual(secondBundle.packageManifest.dependencies, undefined);

        const rewrittenEntry = findEntry(secondBundle, 'entry-second.js');

        assert.strictEqual(
            rewrittenEntry.fileDescription.content,
            "export { shared } from '#shared';\nexport { local } from '#local';\n"
        );
    });
});
