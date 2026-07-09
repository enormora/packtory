import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';

type BuiltPackage = Awaited<ReturnType<typeof packageProcessor.build>>;

type ImportsPackageJson = {
    readonly type: 'module';
    readonly imports: Readonly<Record<string, string>>;
};

type BuildPackageParams = {
    readonly sourcesFolder: string;
    readonly mainPackageJson: ImportsPackageJson;
    readonly name: string;
    readonly version: string;
    readonly entryFileName: string;
    readonly bundleDependencies: readonly BuiltPackage[];
};

async function buildPackage(params: BuildPackageParams): Promise<BuiltPackage> {
    return packageProcessor.build({
        name: params.name,
        version: params.version,
        sourcesFolder: params.sourcesFolder,
        roots: { main: { js: path.join(params.sourcesFolder, params.entryFileName) } },
        mainPackageJson: params.mainPackageJson,
        includeSourceMapFiles: false,
        additionalFiles: [],
        bundleDependencies: params.bundleDependencies,
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {},
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

        const firstBundle = await buildPackage({
            sourcesFolder,
            mainPackageJson,
            name: 'first',
            version: '1.2.3',
            entryFileName: 'entry-first.js',
            bundleDependencies: []
        });
        const secondBundle = await buildPackage({
            sourcesFolder,
            mainPackageJson,
            name: 'second',
            version: '2.3.4',
            entryFileName: 'entry-second.js',
            bundleDependencies: [ firstBundle ]
        });

        assert.deepStrictEqual(firstBundle.packageJson.imports, {
            '#shared': './shared.js'
        });
        assert.partialDeepStrictEqual(secondBundle, {
            packageJson: {
                imports: {
                    '#local': './local.js'
                },
                dependencies: {
                    first: '1.2.3'
                }
            }
        });

        const rewrittenEntry = findEntry(secondBundle, 'entry-second.js');

        assert.strictEqual(
            rewrittenEntry.fileDescription.content,
            "export { shared } from 'first/shared.js';\nexport { local } from '#local';\n"
        );
    });
});
