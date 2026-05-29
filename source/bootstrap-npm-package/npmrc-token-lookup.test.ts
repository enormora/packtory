import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createNpmrcTokenLookup, type NpmrcTokenLookupDependencies } from './npmrc-token-lookup.ts';

function createLookup(content: string | undefined): ReturnType<typeof createNpmrcTokenLookup> {
    const readNpmrc: NpmrcTokenLookupDependencies['readNpmrc'] = async () => {
        return content;
    };
    return createNpmrcTokenLookup({ readNpmrc });
}

suite('npmrc-token-lookup', function () {
    test('returns undefined when no `.npmrc` file is available', async function () {
        const lookup = createLookup(undefined);

        const token = await lookup.findToken('https://registry.npmjs.org/');

        assert.strictEqual(token, undefined);
    });

    test('returns the auth token whose nerf-dart matches the supplied registry URL', async function () {
        const lookup = createLookup('//registry.npmjs.org/:_authToken=npm_abc123\n');

        const token = await lookup.findToken('https://registry.npmjs.org/');

        assert.strictEqual(token, 'npm_abc123');
    });

    test('ignores token lines whose nerf-dart points at a different registry', async function () {
        const content = '//registry.example.com/:_authToken=other-token\n//registry.npmjs.org/:_authToken=npm_xyz\n';
        const lookup = createLookup(content);

        const token = await lookup.findToken('https://registry.npmjs.org/');

        assert.strictEqual(token, 'npm_xyz');
    });

    test('strips surrounding double quotes from quoted token values', async function () {
        const lookup = createLookup('//registry.npmjs.org/:_authToken="quoted-token"\n');

        const token = await lookup.findToken('https://registry.npmjs.org/');

        assert.strictEqual(token, 'quoted-token');
    });

    test('treats an empty token value as no token found', async function () {
        const lookup = createLookup('//registry.npmjs.org/:_authToken=\n');

        const token = await lookup.findToken('https://registry.npmjs.org/');

        assert.strictEqual(token, undefined);
    });

    test('returns undefined when the `.npmrc` content has no matching token line', async function () {
        const lookup = createLookup('always-auth=true\nsave-exact=true\n');

        const token = await lookup.findToken('https://registry.npmjs.org/');

        assert.strictEqual(token, undefined);
    });

    test('normalizes a registry URL without a trailing slash to the canonical nerf-dart form', async function () {
        const lookup = createLookup('//registry.npmjs.org/:_authToken=npm_token\n');

        const token = await lookup.findToken('https://registry.npmjs.org');

        assert.strictEqual(token, 'npm_token');
    });

    test('appends a trailing slash to a non-root registry pathname when building the nerf-dart', async function () {
        const lookup = createLookup('//registry.example.com/private/:_authToken=scoped-token\n');

        const token = await lookup.findToken('https://registry.example.com/private');

        assert.strictEqual(token, 'scoped-token');
    });
});
