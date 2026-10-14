import type { JsonValue as JavaScriptObjectNotationValue } from 'type-fest';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { MainPackageManifest } from '../../configuration/package-manifest.ts';
import { collectHashImportSpecifiers } from './hash-import-scanner.ts';
import { findMatchingImportEntryKey, type ImportsField } from './imports-key-matcher.ts';

function buildMissingImportsFieldMessage(firstSpecifier: string | undefined): string {
    return (
        `Found surviving package.json imports specifier "${firstSpecifier}" ` +
        'but mainPackageManifest.imports is not configured'
    );
}

function buildMissingImportEntryMessage(specifier: string): string {
    return (
        `Found surviving package.json imports specifier "${specifier}" ` +
        'but no matching mainPackageManifest.imports entry'
    );
}

function buildUndefinedImportEntryMessage(specifier: string, matchingKey: string): string {
    return (
        `Found surviving package.json imports specifier "${specifier}" ` +
        `but matching mainPackageManifest.imports entry "${matchingKey}" is undefined`
    );
}

function getConfiguredImportsOrThrow(
    mainPackageManifest: MainPackageManifest,
    referencedSpecifiers: ReadonlySet<string>
): ImportsField {
    if (mainPackageManifest.imports !== undefined) {
        return mainPackageManifest.imports;
    }

    const [ firstSpecifier ] = referencedSpecifiers;
    throw new Error(buildMissingImportsFieldMessage(firstSpecifier));
}

function collectReferencedImportsEntries(
    referencedSpecifiers: ReadonlySet<string>,
    configuredImports: ImportsField
): ImportsField {
    const importsField: Record<string, JavaScriptObjectNotationValue> = {};

    for (const specifier of referencedSpecifiers) {
        const matchingKey = findMatchingImportEntryKey(specifier, configuredImports);
        if (matchingKey === undefined) {
            throw new Error(buildMissingImportEntryMessage(specifier));
        }

        const matchingImport = configuredImports[matchingKey];
        if (matchingImport === undefined) {
            throw new Error(buildUndefinedImportEntryMessage(specifier, matchingKey));
        }

        importsField[matchingKey] = matchingImport;
    }

    return importsField;
}

export function buildImportsField(
    bundle: Pick<AnalyzedBundle, 'contents'>,
    mainPackageManifest: MainPackageManifest
): ImportsField | undefined {
    const referencedSpecifiers = collectHashImportSpecifiers(bundle);
    if (referencedSpecifiers.size === 0) {
        return undefined;
    }

    const configuredImports = getConfiguredImportsOrThrow(mainPackageManifest, referencedSpecifiers);
    return collectReferencedImportsEntries(referencedSpecifiers, configuredImports);
}
