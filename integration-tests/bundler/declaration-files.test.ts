import path from 'node:path';
import test from 'ava';
import { bundler } from '../../source/bundler.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';

test('adds declaration files correctly to the bundle', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-and-d-ts');
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [
            { js: path.join(fixture, 'src/entry.js'), declarationFile: path.join(fixture, 'src/entry.d.ts') }
        ],
        mainPackageJson: await loadPackageJson(fixture)
    });

    t.deepEqual(result, {
        packageJson: {
            dependencies: {},
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0',
            types: 'entry.d.ts',
            type: 'module'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {},\n    "main": "entry.js",\n    "name": "the-package-name",\n    "type": "module",\n    "types": "entry.d.ts",\n    "version": "42.0.0"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/bar.js'),
                targetFilePath: 'bar.js'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry.d.ts'),
                targetFilePath: 'entry.d.ts'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/foo.d.ts'),
                targetFilePath: 'foo.d.ts'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/baz.d.ts'),
                targetFilePath: 'baz.d.ts'
            }
        ]
    });
});
