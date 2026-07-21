import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createPackageReleaseDiff as pkg } from '../../test-libraries/release-diff-fixtures.ts';
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
        const [ firstLine ] = output.split('\n', 1);
        assert.strictEqual(firstLine, 'Packtory release diff  [vs registry latest]');
    });

    test('renderTerminalReleaseDiff joins the package-state summary entries with " · "', function () {
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

        assert.match(output, /3 package\(s\) · 1 changed · 1 first-publish · 1 unchanged · 0 failed/u);
        assert.match(output, /4 files added · 1 removed · 2 modified/u);
    });

    test('renderTerminalReleaseDiff indents the file-count summary line beneath the package-state line', function () {
        const output = renderTerminalReleaseDiff(
            document({
                summary: {
                    totalPackages: 1,
                    changedPackages: 1,
                    firstPublishPackages: 0,
                    unchangedPackages: 0,
                    failedPackages: 0,
                    addedFiles: 2,
                    removedFiles: 0,
                    modifiedFiles: 0
                }
            }),
            { color: false }
        );

        const lines = output.split('\n');
        const fileLine = lines.find(function (line) {
            return line.includes('files added');
        });
        if (fileLine === undefined) {
            assert.fail('expected files added line');
        }
        assert.match(fileLine, /^ {12}· /u);
    });

    test('renderTerminalReleaseDiff omits the issues section when there are no issues', function () {
        const output = renderTerminalReleaseDiff(document(), { color: false });
        const expectedOutput = [
            'Packtory release diff  [vs registry latest]',
            '',
            '0 package(s) · 0 changed · 0 first-publish · 0 unchanged · 0 failed',
            '            · 0 files added · 0 removed · 0 modified',
            ''
        ]
            .join('\n');
        assert.strictEqual(output, expectedOutput);
    });

    test('renderTerminalReleaseDiff includes an Issues section header followed by each issue prefixed with "- "', function () {
        const output = renderTerminalReleaseDiff(document({ issues: [ 'first issue', 'second issue' ] }), {
            color: false
        });

        assert.match(output, /Issues\n- first issue\n- second issue/u);
    });

    test('renderTerminalReleaseDiff joins document sections with a blank line separator and ends with a newline', function () {
        const output = renderTerminalReleaseDiff(document({ issues: [ 'the issue' ] }), { color: false });
        assert.match(output, /\[vs registry latest\]\n\n0 package/u);
        assert.match(output, /0 modified\n\nIssues/u);
        assert.ok(output.endsWith('\n'));
    });

    test('renderTerminalReleaseDiff renders each package section in order separated by blank lines', function () {
        const output = renderTerminalReleaseDiff(
            document({
                packages: [ pkg({ name: 'pkg-a', state: 'unchanged' }), pkg({ name: 'pkg-b', state: 'unchanged' }) ]
            }),
            { color: false }
        );

        const pkgAIndex = output.indexOf('pkg-a  1.0.0  ·  no changes');
        const pkgBIndex = output.indexOf('pkg-b  1.0.0  ·  no changes');
        assert.ok(pkgAIndex > 0, 'pkg-a section missing');
        assert.ok(pkgBIndex > 0, 'pkg-b section missing');
        assert.ok(pkgAIndex < pkgBIndex, 'pkg-a should appear before pkg-b');
        assert.match(output, /pkg-a {2}1\.0\.0 {2}· {2}no changes\n\npkg-b {2}1\.0\.0 {2}· {2}no changes/u);
    });

    test('renderFailureOnlyTerminalReleaseDiff joins each header line with a single newline and ends with a newline', function () {
        const output = renderFailureOnlyTerminalReleaseDiff(
            document({ resultType: 'config', issues: [ 'invalid config' ] }),
            { color: false }
        );

        assert.strictEqual(
            output,
            [ 'Packtory release diff [vs registry latest]', 'Configuration issues', '- invalid config', '' ].join('\n')
        );
    });
});
