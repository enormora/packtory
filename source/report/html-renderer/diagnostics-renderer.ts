import type { PreviewPackage } from '../preview/preview-document.ts';
import { escapeHtml } from './html-escaping.ts';
import { renderCollapsibleSection } from './html-primitives.ts';

type DiagnosticSection = {
    readonly title: string;
    readonly value: unknown;
};

function hasEntries(value: Readonly<Record<string, unknown>>): boolean {
    return Object.keys(value).length > 0;
}

function sectionForDefinedValue(title: string, value: unknown): readonly DiagnosticSection[] {
    return value === undefined ? [] : [ { title, value } ];
}

function sectionForRecord(title: string, value: Readonly<Record<string, unknown>>): readonly DiagnosticSection[] {
    return hasEntries(value) ? [ { title, value } ] : [];
}

function diagnosticSections(pkg: PreviewPackage): readonly DiagnosticSection[] {
    return [
        ...sectionForDefinedValue('Inputs', pkg.diagnostics.inputs),
        ...sectionForRecord('Decisions', pkg.diagnostics.decisions),
        ...sectionForDefinedValue('Outputs', pkg.diagnostics.outputs),
        ...sectionForDefinedValue('Publication', pkg.diagnostics.publication),
        ...sectionForRecord('Timings (ms)', pkg.diagnostics.timings),
        ...sectionForDefinedValue('Failure', pkg.diagnostics.failure)
    ];
}

export function renderDiagnostics(pkg: PreviewPackage): string {
    const sections = diagnosticSections(pkg)
        .map(function (section) {
            return renderCollapsibleSection(section.title, section.value);
        })
        .join('');
    if (sections === '') {
        return '';
    }
    return `<section class="package-block diagnostics"><h3>Diagnostics</h3>${sections}</section>`;
}

export function renderFailureBanner(pkg: PreviewPackage): string {
    if (pkg.failure === undefined) {
        return '';
    }
    return `<p class="failure">Failed in stage <strong>${escapeHtml(pkg.failure.stage)}</strong>: ${
        escapeHtml(pkg.failure.message)
    }</p>`;
}
