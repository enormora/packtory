import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';

type BuiltPackage = Awaited<ReturnType<typeof packageProcessor.build>>;

type BuildPackageInput = {
    readonly name: string;
    readonly version: string;
    readonly fixture: string;
    readonly sourcesFolder: string;
    readonly rootSourceFilePath: string;
    readonly bundleDependencies: readonly BuiltPackage[];
};

async function buildPackage(input: BuildPackageInput): Promise<BuiltPackage> {
    return packageProcessor.build({
        name: input.name,
        version: input.version,
        sourcesFolder: input.sourcesFolder,
        roots: { main: { js: input.rootSourceFilePath } },
        mainPackageJson: await loadPackageJson(input.fixture),
        includeSourceMapFiles: false,
        additionalFiles: [],
        bundleDependencies: input.bundleDependencies,
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

function hasEntry(bundle: BuiltPackage, targetFilePath: string): boolean {
    return bundle.contents.some(function (resource) {
        return resource.fileDescription.targetFilePath === targetFilePath;
    });
}

suite('dynamic-import-substitution', function () {
    test('rewrites static dynamic imports when substituting bundle dependencies', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/dynamic-import-substitution');
        const interpolationMarker = '$';
        const producer = await buildPackage({
            name: 'producer',
            version: '1.2.3',
            fixture,
            sourcesFolder: path.join(fixture, 'src/producer'),
            rootSourceFilePath: path.join(fixture, 'src/producer/index.js'),
            bundleDependencies: []
        });
        const consumer = await buildPackage({
            name: 'consumer',
            version: '2.3.4',
            fixture,
            sourcesFolder: path.join(fixture, 'src'),
            rootSourceFilePath: path.join(fixture, 'src/consumer/index.js'),
            bundleDependencies: [ producer ]
        });

        const entry = findEntry(consumer, 'consumer/index.js');

        assert.strictEqual(
            entry.fileDescription.content,
            [
                'export async function load() {',
                "    const producer = await import('producer');",
                '    const feature = await import(`producer/feature.js`);',
                `    return \`${interpolationMarker}{producer.value}-${interpolationMarker}{feature.feature}\`;`,
                '}',
                ''
            ]
                .join('\n')
        );
        assert.deepStrictEqual(consumer.packageJson.dependencies, { producer: '1.2.3' });
        assert.strictEqual(hasEntry(consumer, 'producer/index.js'), false);
        assert.strictEqual(hasEntry(consumer, 'producer/feature.js'), false);
    });
});
