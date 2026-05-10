import assert from 'node:assert';
import { test } from 'mocha';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { analyzedBundleResource, linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from '../reachability/binding-extractor.ts';
import { bindingId, type FileBindings } from '../reachability/reachability.ts';
import { buildCrossBundleSeeds, type CrossBundleInput } from './cross-bundle-seeds.ts';

function bundleWith(
    name: string,
    files: readonly { readonly sourceFilePath: string; readonly targetFilePath: string; readonly content: string }[]
): LinkedBundle {
    return linkedBundle({
        name,
        contents: files.map((file) => {
            return analyzedBundleResource(file.sourceFilePath, {
                content: file.content,
                targetFilePath: file.targetFilePath
            });
        })
    });
}

function inputFor(
    bundle: LinkedBundle,
    files: readonly { readonly sourceFilePath: string; readonly content: string }[]
): CrossBundleInput {
    const project = createProject({
        withFiles: files.map((file) => {
            return { filePath: file.sourceFilePath, content: file.content };
        })
    });
    const sourceFiles = files.map((file) => {
        return project.getSourceFileOrThrow(file.sourceFilePath);
    });
    const fileBindings: readonly FileBindings[] = sourceFiles.map((sourceFile) => {
        return {
            sourceFilePath: sourceFile.getFilePath(),
            sourceFile,
            bindings: extractTopLevelBindings(sourceFile)
        };
    });
    return { bundle, sourceFiles, fileBindings };
}

test('returns empty map when no bundles are given', () => {
    const seeds = buildCrossBundleSeeds([]);
    assert.strictEqual(seeds.size, 0);
});

test('returns empty seeds for a single bundle with no cross-bundle imports', () => {
    const bundle = bundleWith('pkg-a', [
        { sourceFilePath: '/a/index.ts', targetFilePath: 'index.ts', content: 'export const x = 1;' }
    ]);
    const input = inputFor(bundle, [{ sourceFilePath: '/a/index.ts', content: 'export const x = 1;' }]);
    const seeds = buildCrossBundleSeeds([input]);
    assert.strictEqual(seeds.size, 0);
});

test('records a named import as a seed in the target bundle', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/helpers.ts',
            targetFilePath: 'helpers.ts',
            content: 'export function used() { return 1; }\nexport function unused() { return 2; }'
        }
    ]);
    const consumerInput = inputFor(consumer, [
        {
            sourceFilePath: '/a/index.ts',
            content: 'import { used } from "pkg-b/helpers.ts";\nexport function pub() { return used(); }'
        }
    ]);
    const producerInput = inputFor(producer, [
        {
            sourceFilePath: '/b/helpers.ts',
            content: 'export function used() { return 1; }\nexport function unused() { return 2; }'
        }
    ]);
    const seeds = buildCrossBundleSeeds([consumerInput, producerInput]);
    const bSeeds = seeds.get('pkg-b');
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'used')));
    assert.strictEqual(bSeeds.has(bindingId('/b/helpers.ts', 'unused')), false);
});

test('records a default import as a "default" binding seed', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import dep from "pkg-b/main.ts";\nexport function pub() { return dep; }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/main.ts',
            targetFilePath: 'main.ts',
            content: 'export default 42;'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import dep from "pkg-b/main.ts";\nexport function pub() { return dep; }'
            }
        ]),
        inputFor(producer, [{ sourceFilePath: '/b/main.ts', content: 'export default 42;' }])
    ]);
    const bSeeds = seeds.get('pkg-b');
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/main.ts', 'default')));
});

test('records every binding of the target file as a seed for a namespace import', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import * as helpers from "pkg-b/helpers.ts";\nexport function pub() { return helpers; }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/helpers.ts',
            targetFilePath: 'helpers.ts',
            content: 'export const a = 1;\nexport const b = 2;'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import * as helpers from "pkg-b/helpers.ts";\nexport function pub() { return helpers; }'
            }
        ]),
        inputFor(producer, [{ sourceFilePath: '/b/helpers.ts', content: 'export const a = 1;\nexport const b = 2;' }])
    ]);
    const bSeeds = seeds.get('pkg-b');
    assert.ok(bSeeds !== undefined);
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'a')));
    assert.ok(bSeeds.has(bindingId('/b/helpers.ts', 'b')));
});

test('does not record a seed when the specifier matches a bundle name but not any file in that bundle', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import { used } from "pkg-b/missing.ts";\nexport function pub() { return used(); }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/helpers.ts',
            targetFilePath: 'helpers.ts',
            content: 'export function used() { return 1; }'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import { used } from "pkg-b/missing.ts";\nexport function pub() { return used(); }'
            }
        ]),
        inputFor(producer, [{ sourceFilePath: '/b/helpers.ts', content: 'export function used() { return 1; }' }])
    ]);
    assert.strictEqual(seeds.size, 0);
});

test('does not record seeds for a namespace import that targets a file with no extracted bindings', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import * as data from "pkg-b/data.json";\nexport function pub() { return data; }'
        }
    ]);
    const producer = bundleWith('pkg-b', [
        {
            sourceFilePath: '/b/data.json',
            targetFilePath: 'data.json',
            content: '{}'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import * as data from "pkg-b/data.json";\nexport function pub() { return data; }'
            }
        ]),
        { bundle: producer, sourceFiles: [], fileBindings: [] }
    ]);
    assert.strictEqual(seeds.size, 0);
});

test('does not record a seed for an import that does not match any bundle name', () => {
    const consumer = bundleWith('pkg-a', [
        {
            sourceFilePath: '/a/index.ts',
            targetFilePath: 'index.ts',
            content: 'import { x } from "external-pkg";\nexport function pub() { return x; }'
        }
    ]);
    const seeds = buildCrossBundleSeeds([
        inputFor(consumer, [
            {
                sourceFilePath: '/a/index.ts',
                content: 'import { x } from "external-pkg";\nexport function pub() { return x; }'
            }
        ])
    ]);
    assert.strictEqual(seeds.size, 0);
});
