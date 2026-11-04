import type { PreviewDocument } from '../preview/preview-document.ts';
import { escapeHypertextMarkupLanguage } from './hypertext-markup-language-escaping.ts';
import { renderPackage } from './package-renderer.ts';

function automaticSelection(document: PreviewDocument): string | undefined {
    const failed = document.packages.find(function (entry) {
        return entry.failure !== undefined;
    });
    const transformed = document.packages.find(function (entry) {
        return entry.hasChanges;
    });
    return (failed ?? transformed ?? document.packages[0])?.name;
}

export function renderPackageNavigation(document: PreviewDocument): string {
    const packages = document.packages.toSorted(function (left, right) {
        return left.name.localeCompare(right.name);
    });
    const selected = document.selectedPackage ?? automaticSelection({ ...document, packages });
    const controls = packages
        .map(function (entry, index) {
            const name = escapeHypertextMarkupLanguage(entry.name);
            const input = `<input class="package-choice" type="radio" name="package" id="package-${index}"${
                entry.name === selected ? ' checked' : ''
            }>`;
            const label = `<label for="package-${index}">${name}${
                entry.failure === undefined ? '' : ' (failed)'
            }</label>`;
            return `<span class="package-option">${input}${label}</span>`;
        })
        .join('');
    const panels = packages
        .map(function (entry, index) {
            return `<section class="package-panel package-panel-${index}">${renderPackage(entry)}</section>`;
        })
        .join('');
    const rules = packages
        .map(function (_entry, index) {
            return `.packages:has(#package-${index}:checked) .package-panel-${index} { display: block; }`;
        })
        .join('');
    return `<style>${rules}</style><input id="all-files" type="checkbox"${
        document.allFiles === true ? ' checked' : ''
    }><label for="all-files">Show unchanged entries</label>${controls}${panels}`;
}

export function packageNavigationStyles(): string {
    return `
.package-panel, .tree-all { display: none; }
.package-option { display: inline-block; max-width: 100%; margin-right: 0.75rem; overflow-wrap: anywhere; }
.package-choice { margin: 0 0.3rem 0 0; }
.package-option label { cursor: pointer; }
.packages > label { display: inline-block; margin: 0.4rem 0.75rem 0.4rem 0.25rem; cursor: pointer; }
.package-panel { margin-top: 1rem; }
.package-panel table { width: 100%; table-layout: fixed; border-collapse: collapse; overflow-wrap: anywhere; }
.package-panel th, .package-panel td {
    text-align: left; vertical-align: top; padding: 0.4rem; border-bottom: 1px solid var(--line);
}
.package-choice:focus-visible + label { outline: 2px solid currentColor; }
.paired-trees { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
#all-files:not(:checked) ~ .package-panel .unchanged-row { display: none; }
#all-files:checked ~ .package-panel .tree-changes { display: none; }
#all-files:checked ~ .package-panel .tree-all { display: block; }
@media (max-width: 700px) { .paired-trees { grid-template-columns: 1fr; } }
`;
}
