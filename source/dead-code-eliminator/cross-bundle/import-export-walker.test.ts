import assert from 'node:assert';
import { suite, test } from 'mocha';
import { linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { indexBundles, type IndexedBundle } from './bundle-index.ts';
import { walkCrossBundleStatements } from './import-export-walker.ts';
import { createSeedStore, type SeedMap } from './seed-store.ts';

function emptyIndex(): ReadonlyMap<string, IndexedBundle> {
    return indexBundles([ { bundle: linkedBundle({ name: 'pkg-a' }), fileBindings: [] } ]);
}

function walkContent(
    content: string,
    localReachable: ReadonlySet<string> = new Set()
): SeedMap {
    const project = createProject({ withFiles: [ { filePath: '/a/index.ts', content } ] });
    const sourceFile = project.getSourceFileOrThrow('/a/index.ts');
    const seeds = createSeedStore();
    return walkCrossBundleStatements(sourceFile, {
        indexed: emptyIndex(),
        seeds,
        sourceFilePath: sourceFile.getFilePath(),
        localReachable
    });
}

suite('import-export-walker', function () {
    test('walkCrossBundleStatements does nothing when the file has no import or export statements', function () {
        assert.strictEqual(walkContent('const x = 1;').size, 0);
    });

    test('walkCrossBundleStatements ignores imports whose specifier matches no indexed bundle', function () {
        assert.strictEqual(walkContent('import { x } from "external";', new Set([ 'x' ])).size, 0);
    });

    test('walkCrossBundleStatements ignores exports whose specifier matches no indexed bundle', function () {
        assert.strictEqual(walkContent('export { x } from "external";').size, 0);
    });

    test('walkCrossBundleStatements skips bare re-exports that have no module specifier', function () {
        assert.strictEqual(walkContent('function helper() { return 1; }\nexport { helper };').size, 0);
    });
});
