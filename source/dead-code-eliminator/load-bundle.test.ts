import assert from 'node:assert';
import { test } from 'mocha';
import { linkedBundle, bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { loadBundle } from './load-bundle.ts';

test('loadBundle() throws when the public surface references a missing root', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: {
                js: {
                    sourceFilePath: '/src/index.js',
                    targetFilePath: 'index.js',
                    content: 'export const value = 1;\n',
                    isExecutable: false
                }
            }
        },
        contents: [
            {
                ...bundleResource('/src/index.js', {
                    content: 'export const value = 1;\n',
                    targetFilePath: 'index.js'
                }),
                isSubstituted: false
            }
        ],
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'missing', export: '.' }]
            }
        }
    });

    assert.throws(() => {
        loadBundle(createProject, { bundle, transformationsEnabled: true });
    }, /^Error: Bundle "package-a" is missing root "missing" referenced by its entry surface$/u);
});
