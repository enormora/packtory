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

function diagnosticSections(previewPackage: PreviewPackage): readonly DiagnosticSection[] {
    return [
        ...sectionForDefinedValue('Inputs', previewPackage.diagnostics.inputs),
        ...sectionForRecord('Decisions', previewPackage.diagnostics.decisions),
        ...sectionForDefinedValue('Outputs', previewPackage.diagnostics.outputs),
        ...sectionForDefinedValue('Publication', previewPackage.diagnostics.publication),
        ...sectionForRecord('Timings (ms)', previewPackage.diagnostics.timings),
        ...sectionForDefinedValue('Failure', previewPackage.diagnostics.failure)
    ];
}

export function renderDiagnostics(previewPackage: PreviewPackage): string {
    const sections = diagnosticSections(previewPackage)
        .map(function (section) {
            return renderCollapsibleSection(section.title, section.value);
        })
        .join('');
    if (sections === '') {
        return '';
    }
    return `<section class="package-block diagnostics"><h3>Diagnostics</h3>${sections}</section>`;
}

export function renderFailureBanner(previewPackage: PreviewPackage): string {
    if (previewPackage.failure === undefined) {
        return '';
    }
    return `<p class="failure">Failed in stage <strong>${escapeHtml(previewPackage.failure.stage)}</strong>: ${
        escapeHtml(previewPackage.failure.message)
    }</p>`;
}
