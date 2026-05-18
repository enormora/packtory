import assert from 'node:assert';
import { test } from 'mocha';
import type { PreviewPackage } from '../preview/preview-document.ts';
import { renderDiagnostics, renderFailureBanner } from './diagnostics-renderer.ts';

const emptyDiagnostics: PreviewPackage['diagnostics'] = {
    decisions: {},
    timings: {}
};

function packageWithDiagnostics(diagnostics: PreviewPackage['diagnostics']): Pick<PreviewPackage, 'diagnostics'> {
    return { diagnostics };
}

test('renderDiagnostics returns an empty string when all diagnostic sections are empty', () => {
    assert.strictEqual(renderDiagnostics(packageWithDiagnostics(emptyDiagnostics) as PreviewPackage), '');
});

test('renderDiagnostics renders the Inputs section when inputs are present', () => {
    const html = renderDiagnostics(
        packageWithDiagnostics({
            ...emptyDiagnostics,
            inputs: { roots: { main: 'src/index.js' }, siblingVersions: {}, sourceFileCount: 1 }
        }) as PreviewPackage
    );

    assert.ok(html.includes('<summary>Inputs</summary>'));
    assert.ok(html.includes('&quot;sourceFileCount&quot;: 1'));
});

test('renderDiagnostics renders the Decisions section when decisions are populated', () => {
    const html = renderDiagnostics(
        packageWithDiagnostics({
            ...emptyDiagnostics,
            decisions: { linker: { rewrites: [] } }
        }) as PreviewPackage
    );

    assert.ok(html.includes('<summary>Decisions</summary>'));
});

test('renderDiagnostics renders the Outputs section when outputs are present', () => {
    const html = renderDiagnostics(
        packageWithDiagnostics({
            ...emptyDiagnostics,
            outputs: { tarball: { entries: [], totalBytes: 0 } }
        }) as PreviewPackage
    );

    assert.ok(html.includes('<summary>Outputs</summary>'));
});

test('renderDiagnostics renders the Timings section when timings are populated', () => {
    const html = renderDiagnostics(
        packageWithDiagnostics({ ...emptyDiagnostics, timings: { publish: 5 } }) as PreviewPackage
    );

    assert.ok(html.includes('<summary>Timings (ms)</summary>'));
});

test('renderDiagnostics renders the Failure section when a failure is recorded', () => {
    const html = renderDiagnostics(
        packageWithDiagnostics({
            ...emptyDiagnostics,
            failure: { stage: 'publish', message: 'boom' }
        }) as PreviewPackage
    );

    assert.ok(html.includes('<summary>Failure</summary>'));
});

test('renderFailureBanner returns an empty string when the package has no failure', () => {
    const html = renderFailureBanner({ failure: undefined } as PreviewPackage);

    assert.strictEqual(html, '');
});

test('renderFailureBanner renders the failure stage and message with HTML escaping', () => {
    const html = renderFailureBanner({
        failure: { stage: 'publish', message: 'boom <oops>' }
    } as PreviewPackage);

    assert.ok(html.includes('Failed in stage <strong>publish</strong>'));
    assert.ok(html.includes('boom &lt;oops&gt;'));
});
