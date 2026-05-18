import assert from 'node:assert';
import { test } from 'mocha';
import {
    buildInvalidProvenanceFileMessage,
    buildMissingProvenanceFileMessage,
    buildProvenanceDigestMismatchMessage,
    buildUnsupportedProviderMessage,
    githubActionsIdTokenMessage,
    gitlabSigstoreIdTokenMessage,
    unsupportedProviderMarker
} from './publish-error-messages.ts';

test('unsupportedProviderMarker exposes the canonical marker substring', () => {
    assert.strictEqual(unsupportedProviderMarker, 'not supported for provider:');
});

test('githubActionsIdTokenMessage references the id-token write permission', () => {
    assert.ok(githubActionsIdTokenMessage.includes('permissions: id-token: write'));
});

test('gitlabSigstoreIdTokenMessage references the sigstore audience', () => {
    assert.ok(gitlabSigstoreIdTokenMessage.includes('sigstore'));
});

test('buildUnsupportedProviderMessage embeds the detected CI name in the message', () => {
    assert.ok(buildUnsupportedProviderMessage('CircleCI').includes('Detected CI: CircleCI.'));
});

test('buildMissingProvenanceFileMessage embeds the file path in the message', () => {
    assert.ok(buildMissingProvenanceFileMessage('/p/bundle.json').includes('"/p/bundle.json"'));
});

test('buildInvalidProvenanceFileMessage embeds the file path and mentions sigstore', () => {
    const message = buildInvalidProvenanceFileMessage('/p/bundle.json');
    assert.ok(message.includes('"/p/bundle.json"'));
    assert.ok(message.includes('sigstore'));
});

test('buildProvenanceDigestMismatchMessage embeds the file path and warns about defeating provenance', () => {
    const message = buildProvenanceDigestMismatchMessage('/p/bundle.json');
    assert.ok(message.includes('/p/bundle.json'));
    assert.ok(message.includes('defeat'));
});
