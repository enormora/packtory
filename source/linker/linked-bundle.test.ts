import assert from 'node:assert';
import { suite, test } from 'mocha';
import { getSubstitutedResources } from './linked-bundle.ts';

suite('linked-bundle', function () {
    test('getSubstitutedResources returns an empty array when no resource is substituted', function () {
        const result = getSubstitutedResources({
            contents: [
                { isSubstituted: false, name: 'a' },
                { isSubstituted: false, name: 'b' }
            ]
        });

        assert.deepStrictEqual(result, []);
    });

    test('getSubstitutedResources keeps only the resources whose isSubstituted flag is true', function () {
        const result = getSubstitutedResources({
            contents: [
                { isSubstituted: true, name: 'a' },
                { isSubstituted: false, name: 'b' },
                { isSubstituted: true, name: 'c' }
            ]
        });

        assert.deepStrictEqual(
            result.map(function (resource) {
                return resource.name;
            }),
            [ 'a', 'c' ]
        );
    });

    test('getSubstitutedResources returns an empty array for an empty contents array', function () {
        assert.deepStrictEqual(getSubstitutedResources({ contents: [] }), []);
    });
});
