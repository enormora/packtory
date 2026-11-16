import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { additionalPackageManifestAttributesSchema } from './additional-package-manifest-attributes-schema.ts';
import { mainPackageManifestSchema } from './main-package-manifest-schema.ts';

suite('schema manifest contracts', function () {
    test('package json schemas keep their runtime structure and forbidden key behavior', async function () {
        const forbiddenKeySuccesses = [
            'bin',
            'dependencies',
            'peerDependencies',
            'devDependencies',
            'exports',
            'imports',
            'main',
            'name',
            'types',
            'type',
            'version'
        ]
            .map(function (key) {
                return safeParse(additionalPackageManifestAttributesSchema, {
                    [key]: '1.0.0'
                })
                    .success;
            });
        const result = {
            validMainSuccess: safeParse(mainPackageManifestSchema, {
                type: 'module',
                dependencies: {
                    dep: '1.0.0'
                }
            })
                .success,
            forbiddenKeySuccesses
        };
        assert.deepStrictEqual(result, {
            validMainSuccess: true,
            forbiddenKeySuccesses: [ false, false, false, false, false, false, false, false, false, false, false ]
        });
    });
});
