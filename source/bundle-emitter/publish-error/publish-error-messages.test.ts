import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    buildInvalidProvenanceFileMessage,
    buildMissingProvenanceFileMessage,
    buildProvenanceDigestMismatchMessage,
    buildUnsupportedProviderMessage,
    githubActionsIdTokenMessage,
    gitlabSigstoreIdTokenMessage,
    unsupportedProviderMarker
} from './publish-error-messages.ts';

suite('publish-error-messages', function () {
    test('unsupportedProviderMarker exposes the canonical marker substring', function () {
        assert.strictEqual(unsupportedProviderMarker, 'not supported for provider:');
    });

    test('githubActionsIdTokenMessage references the id-token write permission', function () {
        assert.ok(githubActionsIdTokenMessage.includes('permissions: id-token: write'));
    });

    test('gitlabSigstoreIdTokenMessage references the sigstore audience', function () {
        assert.ok(gitlabSigstoreIdTokenMessage.includes('sigstore'));
    });

    test('buildUnsupportedProviderMessage embeds the detected CI name in the message', function () {
        assert.ok(buildUnsupportedProviderMessage('CircleCI').includes('Detected CI: CircleCI.'));
    });

    test('buildMissingProvenanceFileMessage embeds the file path in the message', function () {
        assert.ok(buildMissingProvenanceFileMessage('/p/bundle.json').includes('"/p/bundle.json"'));
    });

    test('buildInvalidProvenanceFileMessage embeds the file path and mentions sigstore', function () {
        const message = buildInvalidProvenanceFileMessage('/p/bundle.json');
        assert.ok(message.includes('"/p/bundle.json"'));
        assert.ok(message.includes('sigstore'));
    });

    test('buildProvenanceDigestMismatchMessage embeds the file path and warns about defeating provenance', function () {
        const message = buildProvenanceDigestMismatchMessage('/p/bundle.json');
        assert.ok(message.includes('/p/bundle.json'));
        assert.ok(message.includes('defeat'));
    });
});
