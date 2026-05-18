import type { JsonValue } from 'type-fest';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { MainPackageJson } from '../../config/package-json.ts';
import { collectHashImportSpecifiers } from './hash-import-scanner.ts';
import { findMatchingImportEntryKey, type ImportsField } from './imports-key-matcher.ts';

function getConfiguredImportsOrThrow(
    mainPackageJson: MainPackageJson,
    referencedSpecifiers: ReadonlySet<string>
): ImportsField {
    if (mainPackageJson.imports !== undefined) {
        return mainPackageJson.imports;
    }

    const [firstSpecifier] = referencedSpecifiers;
    throw new Error(
        [
            `Found surviving package.json imports specifier "${firstSpecifier}"`,
            'but mainPackageJson.imports is not configured'
        ].join(' ')
    );
}

function collectReferencedImportsEntries(
    referencedSpecifiers: ReadonlySet<string>,
    configuredImports: ImportsField
): ImportsField {
    const importsField: Record<string, JsonValue> = {};

    for (const specifier of referencedSpecifiers) {
        const matchingKey = findMatchingImportEntryKey(specifier, configuredImports);
        if (matchingKey === undefined) {
            throw new Error(
                [
                    `Found surviving package.json imports specifier "${specifier}"`,
                    'but no matching mainPackageJson.imports entry'
                ].join(' ')
            );
        }

        const matchingImport = configuredImports[matchingKey];
        if (matchingImport === undefined) {
            throw new Error(
                [
                    `Found surviving package.json imports specifier "${specifier}"`,
                    `but matching mainPackageJson.imports entry "${matchingKey}" is undefined`
                ].join(' ')
            );
        }

        importsField[matchingKey] = matchingImport;
    }

    return importsField;
}

export function buildImportsField(
    bundle: Pick<AnalyzedBundle, 'contents'>,
    mainPackageJson: MainPackageJson
): ImportsField | undefined {
    const referencedSpecifiers = collectHashImportSpecifiers(bundle);
    if (referencedSpecifiers.size === 0) {
        return undefined;
    }

    const configuredImports = getConfiguredImportsOrThrow(mainPackageJson, referencedSpecifiers);
    return collectReferencedImportsEntries(referencedSpecifiers, configuredImports);
}
