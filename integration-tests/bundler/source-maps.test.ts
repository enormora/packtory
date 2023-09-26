import assert from 'node:assert';
import {test} from 'node:test';
import {bundler} from '../../source/bundler.entry-point.js'
import {loadPackageJson} from '../load-package-json.js'
import path from 'node:path';

test('adds map files to the bundle when enabled', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-and-source-maps');
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [ {js: path.join(fixture, 'src/entry.js')} ],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: true
    });

    assert.deepStrictEqual(result, {
        packageJson: {
            dependencies: {},
            main: 'entry.js',
            type: 'module',
            name: 'the-package-name',
            version: '42.0.0'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "name": "the-package-name",\n    "version": "42.0.0",\n    "dependencies": {},\n    "main": "entry.js",\n    "type": "module"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/entry.js.map'),
                targetFilePath: 'entry.js.map'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/foo.js.map'),
                targetFilePath: 'foo.js.map'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/bar.js'),
                targetFilePath: 'bar.js'
            },
        ]
    });
});
