import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ReleaseDiffDocument } from '../release-diff/release-diff-document.ts';
import { renderFailureOnlyTerminalReleaseDiff, renderTerminalReleaseDiff } from './terminal-release-diff-renderer.ts';

function document(overrides: Partial<ReleaseDiffDocument> = {}): ReleaseDiffDocument {
    return {
        title: 'Packtory release diff',
        modeLabel: 'vs registry latest',
        previewable: true,
        resultType: 'success',
        summary: {
            totalPackages: 0,
            changedPackages: 0,
            firstPublishPackages: 0,
            unchangedPackages: 0,
            failedPackages: 0,
            addedFiles: 0,
            removedFiles: 0,
            modifiedFiles: 0
        },
        packages: [],
        issues: [],
        report: {
            schemaVersion: 1,
            generatedAt: '2026-05-19T00:00:00.000Z',
            packages: {},
            aggregate: { crossBundleLinks: [] }
        },
        ...overrides
    };
}

suite('terminal-release-diff-renderer', function () {
    test('renderTerminalReleaseDiff renders the document title with the chip', function () {
        const output = renderTerminalReleaseDiff(document(), { color: false });
        assert.match(output, /Packtory release diff/u);
        assert.match(output, /\[vs registry latest\]/u);
    });

    test('renderTerminalReleaseDiff renders package-state and file-count summary lines', function () {
        const output = renderTerminalReleaseDiff(
            document({
                summary: {
                    totalPackages: 3,
                    changedPackages: 1,
                    firstPublishPackages: 1,
                    unchangedPackages: 1,
                    failedPackages: 0,
                    addedFiles: 4,
                    removedFiles: 1,
                    modifiedFiles: 2
                }
            }),
            { color: false }
        );
        assert.match(output, /3 package\(s\)/u);
        assert.match(output, /1 changed/u);
        assert.match(output, /1 first-publish/u);
        assert.match(output, /1 unchanged/u);
        assert.match(output, /0 failed/u);
        assert.match(output, /4 files added/u);
        assert.match(output, /1 removed/u);
        assert.match(output, /2 modified/u);
    });

    test('renderTerminalReleaseDiff includes an issues section when issues are present', function () {
        const output = renderTerminalReleaseDiff(document({ issues: ['something broke'] }), { color: false });
        assert.match(output, /Issues/u);
        assert.match(output, /- something broke/u);
    });

    test('renderFailureOnlyTerminalReleaseDiff renders the title and result-type heading', function () {
        const output = renderFailureOnlyTerminalReleaseDiff(
            document({ resultType: 'config', issues: ['invalid config'] }),
            { color: false }
        );
        assert.match(output, /Packtory release diff/u);
        assert.match(output, /Configuration issues/u);
        assert.match(output, /- invalid config/u);
    });
});
