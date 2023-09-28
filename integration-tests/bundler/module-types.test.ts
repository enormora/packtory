import path from 'node:path';
import test from 'ava';
import { bundler } from '../../source/bundler.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';

test('correctly resolves CommonJS files', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-cjs');
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
                sourceFilePath: path.join(fixture, 'src/foo.js'),
                targetFilePath: 'foo.js'
            }
        ]
    });
});

test('correctly resolves ESM files', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm');
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
            version: '42.0.0',
            type: 'module'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {},\n    "main": "entry.js",\n    "name": "the-package-name",\n    "type": "module",\n    "version": "42.0.0"\n}',
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
            }
        ]
    });
});

test('correctly resolves ESM files with export from statements', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-export-from');
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
            version: '42.0.0',
            type: 'module'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {},\n    "main": "entry.js",\n    "name": "the-package-name",\n    "type": "module",\n    "version": "42.0.0"\n}',
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
            }
        ]
    });
});

test('correctly resolves ESM files with plain import statements', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-plain-import');
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
            version: '42.0.0',
            type: 'module'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {},\n    "main": "entry.js",\n    "name": "the-package-name",\n    "type": "module",\n    "version": "42.0.0"\n}',
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
            }
        ]
    });
});
