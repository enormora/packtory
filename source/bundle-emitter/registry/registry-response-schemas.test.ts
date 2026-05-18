import assert from 'node:assert';
import { suite, test } from 'mocha';
import { parseAbbreviatedPackageResponse, parseOidcExchangeResponse } from './registry-response-schemas.ts';

suite('registry-response-schemas', function () {
    test('parseAbbreviatedPackageResponse returns the data when the response matches the schema', function () {
        assert.deepStrictEqual(
            parseAbbreviatedPackageResponse({
                name: 'pkg-a',
                'dist-tags': { latest: '1.0.0' },
                versions: { '1.0.0': { dist: { tarball: 'https://example.com/pkg-a-1.0.0.tgz' } } }
            }),
            {
                name: 'pkg-a',
                'dist-tags': { latest: '1.0.0' },
                versions: { '1.0.0': { dist: { tarball: 'https://example.com/pkg-a-1.0.0.tgz' } } }
            }
        );
    });

    test('parseAbbreviatedPackageResponse returns undefined when the response is missing required fields', function () {
        assert.strictEqual(parseAbbreviatedPackageResponse({ name: 'pkg-a' }), undefined);
    });

    test('parseAbbreviatedPackageResponse returns undefined when a version entry has no tarball', function () {
        assert.strictEqual(
            parseAbbreviatedPackageResponse({
                name: 'pkg-a',
                'dist-tags': { latest: '1.0.0' },
                versions: { '1.0.0': { dist: {} } }
            }),
            undefined
        );
    });

    test('parseAbbreviatedPackageResponse accepts a response without dist-tags.latest', function () {
        assert.deepStrictEqual(parseAbbreviatedPackageResponse({ name: 'pkg-a', 'dist-tags': {}, versions: {} }), {
            name: 'pkg-a',
            'dist-tags': {},
            versions: {}
        });
    });

    test('parseOidcExchangeResponse returns the data when all token fields are present', function () {
        assert.deepStrictEqual(
            parseOidcExchangeResponse({
                token_type: 'Bearer',
                token: 'abc',
                created: '2026-01-01T00:00:00Z',
                expires: '2026-01-01T01:00:00Z'
            }),
            {
                token_type: 'Bearer',
                token: 'abc',
                created: '2026-01-01T00:00:00Z',
                expires: '2026-01-01T01:00:00Z'
            }
        );
    });

    test('parseOidcExchangeResponse returns undefined when a required field is missing', function () {
        assert.strictEqual(parseOidcExchangeResponse({ token: 'abc' }), undefined);
    });
});
