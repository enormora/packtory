import assert from 'node:assert';
import { suite, test } from 'mocha';
import { checkPublishedPackage } from '../test-libraries/check-fixtures.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import { createPackageAnalysisIdentity } from './package-analysis-identity.ts';

function publishedPackage(): PublishedPackageWithManifest {
    return checkPublishedPackage('example', '{"name":"example","types":"index.d.ts"}', {
        'index.d.ts': 'export declare const value: number;'
    });
}

suite('package analysis identities', function () {
    test('inspects immutable package contents once across repeated lookups', function () {
        const original = publishedPackage();
        let reads = 0;
        const observed = {
            ...original,
            get contents() {
                reads += 1;
                return original.contents;
            }
        };
        const identities = createPackageAnalysisIdentity();
        const first = identities.package(observed);
        assert.strictEqual(identities.package(observed), first);
        identities.resolution(new Map([ [ 'example', observed ] ]));
        assert.strictEqual(reads, 1);
    });

    test('distinguishes manifest paths, manifest contents, file paths, and file contents', function () {
        const original = publishedPackage();
        const identities = createPackageAnalysisIdentity();
        const first = identities.package(original);
        for (
            const changed of [
                { ...original, manifestFile: { ...original.manifestFile, filePath: 'other.json' } },
                { ...original, manifestFile: { ...original.manifestFile, content: '{"types":"missing.d.ts"}' } },
                {
                    ...original,
                    contents: original.contents.map(function (resource) {
                        return {
                            ...resource,
                            fileDescription: { ...resource.fileDescription, targetFilePath: 'other.d.ts' }
                        };
                    })
                },
                {
                    ...original,
                    contents: original.contents.map(function (resource) {
                        return {
                            ...resource,
                            fileDescription: { ...resource.fileDescription, content: 'export const changed: number;' }
                        };
                    })
                }
            ]
        ) {
            assert.notStrictEqual(identities.package(changed), first);
        }
    });

    test('distinguishes resolution names and sibling package contents', function () {
        const original = publishedPackage();
        const changed = checkPublishedPackage('example', '{"types":"index.d.ts"}', {
            'index.d.ts': 'export type Value = string;'
        });
        const identities = createPackageAnalysisIdentity();
        const initial = identities.resolution(new Map([ [ 'example', original ] ]));
        assert.notStrictEqual(identities.resolution(new Map([ [ 'renamed', original ] ])), initial);
        assert.notStrictEqual(identities.resolution(new Map([ [ 'example', changed ] ])), initial);
    });
});
