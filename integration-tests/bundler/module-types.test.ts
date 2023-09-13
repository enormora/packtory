import assert from 'node:assert';
import {test} from 'node:test';
import {bundler} from '../../source/entry.js'
import {loadPackageJson} from '../load-package-json.js'
import path from 'node:path';

test('correctly resolves CommonJS files', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-cjs');
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [ {js: path.join(fixture, 'src/entry.js')} ],
        mainPackageJson: await loadPackageJson(fixture)
    });

    assert.deepStrictEqual(result, {
        packageJson: {
            dependencies: {},
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "name": "the-package-name",\n    "version": "42.0.0",\n    "dependencies": {},\n    "main": "entry.js"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js'
            },
        ]
    });
});

test('correctly resolves ESM files', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm');
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [ {js: path.join(fixture, 'src/entry.js')} ],
        mainPackageJson: await loadPackageJson(fixture)
    });

    assert.deepStrictEqual(result, {
        packageJson: {
            dependencies: {},
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "name": "the-package-name",\n    "version": "42.0.0",\n    "dependencies": {},\n    "main": "entry.js"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js'
            },
        ]
    });
});

test('correctly resolves ESM files with export from statements', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-export-from');
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [ {js: path.join(fixture, 'src/entry.js')} ],
        mainPackageJson: await loadPackageJson(fixture)
    });

    assert.deepStrictEqual(result, {
        packageJson: {
            dependencies: {},
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "name": "the-package-name",\n    "version": "42.0.0",\n    "dependencies": {},\n    "main": "entry.js"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js'
            },
        ]
    });
});

test('correctly resolves ESM files with plain import statements', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-plain-import');
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [ {js: path.join(fixture, 'src/entry.js')} ],
        mainPackageJson: await loadPackageJson(fixture)
    });

    assert.deepStrictEqual(result, {
        packageJson: {
            dependencies: {},
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "name": "the-package-name",\n    "version": "42.0.0",\n    "dependencies": {},\n    "main": "entry.js"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            },
            {
                kind: "reference",
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js'
            },
        ]
    });
});
