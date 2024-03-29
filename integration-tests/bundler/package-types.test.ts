import path from 'node:path';
import test from 'ava';
import { bundler } from '../../source/packages/bundler/bundler.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';

test('includes all required local files and references correct node modules but ignores builtin modules', async (t) => {
    const fixture = path.join(
        process.cwd(),
        'integration-tests/fixtures/with-local-builtin-and-node-module-dependencies'
    );
    const result = await bundler.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [{ js: path.join(fixture, 'src/entry.js') }],
        mainPackageJson: await loadPackageJson(fixture)
    });

    t.deepEqual(result, {
        packageJson: {
            dependencies: { 'example-module': '1.2.3' },
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {\n        "example-module": "1.2.3"\n    },\n    "main": "entry.js",\n    "name": "the-package-name",\n    "version": "42.0.0"\n}',
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
            }
        ]
    });
});

test('includes peer dependencies correctly', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/with-peer-dependencies');
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
            peerDependencies: { 'example-module': '1.2.3' },
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        contents: [
            {
                kind: 'source',
                source: '{\n    "dependencies": {},\n    "main": "entry.js",\n    "name": "the-package-name",\n    "peerDependencies": {\n        "example-module": "1.2.3"\n    },\n    "version": "42.0.0"\n}',
                targetFilePath: 'package.json'
            },
            {
                kind: 'reference',
                sourceFilePath: path.join(fixture, 'src/entry.js'),
                targetFilePath: 'entry.js'
            }
        ]
    });
});
