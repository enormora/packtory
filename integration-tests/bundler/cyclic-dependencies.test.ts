import test from "ava"
import { bundler } from '../../source/bundler.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';
import path from 'node:path';

test('correctly detects cyclic dependencies and avoids an infinite loop', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-cyclic');
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [{ js: path.join(fixture, 'src/entry.js') }],
        mainPackageJson: await loadPackageJson(fixture),
    });

    t.deepEqual(result, {
        packageJson: {
            dependencies: {},
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0',
            type: 'module',
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "name": "the-package-name",\n    "version": "42.0.0",\n    "dependencies": {},\n    "main": "entry.js",\n    "type": "module"\n}',
                targetFilePath: 'package.json',
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js',
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js',
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/bar.js'),
                targetFilePath: 'bar.js',
            },
        ],
    });
});
