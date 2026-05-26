import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    parseAbbreviatedPackageResponse,
    parseFullPackageResponse,
    parseOidcExchangeResponse
} from './registry-response-schemas.ts';

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

    test('parseFullPackageResponse returns the data when optional time entries are present', function () {
        assert.deepStrictEqual(
            parseFullPackageResponse({
                name: 'pkg-a',
                'dist-tags': { latest: '1.0.0' },
                time: { '1.0.0': '2026-05-19T10:00:00.000Z' },
                versions: { '1.0.0': { dist: { tarball: 'https://example.com/pkg-a-1.0.0.tgz' } } }
            }),
            {
                name: 'pkg-a',
                'dist-tags': { latest: '1.0.0' },
                time: { '1.0.0': '2026-05-19T10:00:00.000Z' },
                versions: { '1.0.0': { dist: { tarball: 'https://example.com/pkg-a-1.0.0.tgz' } } }
            }
        );
    });

    test('parseFullPackageResponse returns undefined when a version tarball is missing', function () {
        assert.strictEqual(
            parseFullPackageResponse({
                name: 'pkg-a',
                'dist-tags': { latest: '1.0.0' },
                versions: { '1.0.0': { dist: {} } }
            }),
            undefined
        );
    });

    test('parseOidcExchangeResponse coerces an ISO-string expires to a Date and strips fields it does not consume', function () {
        assert.deepStrictEqual(
            parseOidcExchangeResponse({
                token_type: 'Bearer',
                token: 'abc',
                created: '2026-01-01T00:00:00Z',
                expires: '2026-01-01T01:00:00Z'
            }),
            {
                success: true,
                data: { token: 'abc', expires: new Date('2026-01-01T01:00:00Z') }
            }
        );
    });

    test('parseOidcExchangeResponse coerces a numeric expires to a Date', function () {
        assert.deepStrictEqual(parseOidcExchangeResponse({ token: 'abc', expires: 1_746_529_200_000 }), {
            success: true,
            data: { token: 'abc', expires: new Date(1_746_529_200_000) }
        });
    });

    test('parseOidcExchangeResponse reports validation issues when expires is missing', function () {
        assert.deepStrictEqual(parseOidcExchangeResponse({ token: 'abc' }), {
            success: false,
            issues: ['at expires: missing property']
        });
    });

    test('parseOidcExchangeResponse reports validation issues when expires cannot be coerced to a Date', function () {
        const result = parseOidcExchangeResponse({ token: 'abc', expires: 'not-a-date' });
        if (result.success) {
            assert.fail('expected validation to fail when expires is not a date');
        }
        assert.match(result.issues.join('; '), /at expires/u);
    });
});
