import path from 'node:path';
import test from 'ava';
import { bundler } from '../../source/packages/bundler/bundler.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';

test('resolves files in a nested folder structure correctly', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/nested-folders');
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [{ js: path.join(fixture, 'src/entry.js') }],
        mainPackageJson: await loadPackageJson(fixture)
    });

    t.deepEqual(result, {
        packageJson: {
            dependencies: {},
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {},\n    "main": "entry.js",\n    "name": "the-package-name",\n    "version": "42.0.0"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/nested/foo.js'),
                targetFilePath: 'nested/foo.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/nested/deep/bar.js'),
                targetFilePath: 'nested/deep/bar.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/nested/deep/folder/baz.js'),
                targetFilePath: 'nested/deep/folder/baz.js'
            }
        ]
    });
});
