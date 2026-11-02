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
            return `<input class="package-choice" type="radio" name="package" id="package-${index}"${
                entry.name === selected ? ' checked' : ''
            }><label for="package-${index}">${name}${entry.failure === undefined ? '' : ' (failed)'}</label>`;
        })
        .join('');
    const panels = packages
        .map(function (entry, index) {
            return `<section class="package-panel package-panel-${index}">${renderPackage(entry)}</section>`;
        })
        .join('');
    const rules = packages
        .map(function (_entry, index) {
            return `#package-${index}:checked ~ .package-panel-${index} { display: block; }`;
        })
        .join('');
    return `<style>${rules}</style><input id="all-files" type="checkbox"${
        document.allFiles === true ? ' checked' : ''
    }><label for="all-files">Show unchanged entries</label>${controls}${panels}`;
}

export function packageNavigationStyles(): string {
    return `
.package-panel, .tree-all { display: none; }
.package-choice { margin-left: 1rem; }
.package-choice:focus-visible + label { outline: 2px solid currentColor; }
.paired-trees { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
#all-files:not(:checked) ~ .package-panel .unchanged-row { display: none; }
#all-files:checked ~ .package-panel .tree-changes { display: none; }
#all-files:checked ~ .package-panel .tree-all { display: block; }
@media (max-width: 700px) { .paired-trees { grid-template-columns: 1fr; } }
`;
}
