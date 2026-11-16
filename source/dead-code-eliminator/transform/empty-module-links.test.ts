import assert from 'node:assert';
import { suite, test } from 'mocha';
import { analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { loadResource } from '../load-resource.ts';
import { removeEmptyModuleLinks } from './empty-module-links.ts';

suite('empty module link proofs', function () {
    test('removes links to modules containing only empty statements and exports', function () {
        const project = createProject();
        const resources = [
            analyzedBundleResource('/source/index.js', {
                content: 'import "./empty.js";export const value=42;'
            }),
            analyzedBundleResource('/source/empty.js', { content: ';export {};;' })
        ];
        const loaded = resources.map(function (resource) {
            return loadResource(project, project, resource, false);
        });
        const outputs = resources.map(function (resource) {
            return { resource, transforms: [] };
        });
        const result = removeEmptyModuleLinks(outputs, loaded);
        assert.strictEqual(result[0]?.resource.fileDescription.content, 'export const value=42;');
    });
});
