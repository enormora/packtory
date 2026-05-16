import { ts as typescript } from 'ts-morph';
import type { JsonValue } from 'type-fest';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import { isCodeFile } from '../common/code-files.ts';

export type ImportsField = NonNullable<MainPackageJson['imports']>;

function getHashImportSpecifiers(bundle: AnalyzedBundle): ReadonlySet<string> {
    const importSpecifiers = new Set<string>();

    for (const resource of bundle.contents) {
        const {
            fileDescription: { targetFilePath, content }
        } = resource;

        if (isCodeFile(targetFilePath)) {
            const parsedFile = typescript.preProcessFile(content, true);
            for (const literal of parsedFile.importedFiles) {
                const specifier = literal.fileName;
                if (specifier.startsWith('#')) {
                    importSpecifiers.add(specifier);
                }
            }
        }
    }

    return importSpecifiers;
}

function escapeRegExp(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function findMatchingImportEntryKey(specifier: string, importsField: ImportsField): string | undefined {
    const matchingKeys = Object.keys(importsField)
        .filter((key) => {
            const wildcardPattern = `^${escapeRegExp(key).replaceAll('\\*', '.*')}$`;
            return new RegExp(wildcardPattern).test(specifier);
        })
        .toSorted((left, right) => {
            if (left === specifier || right === specifier) {
                return left === specifier ? -1 : 1;
            }

            return right.length - left.length;
        });

    return matchingKeys[0];
}

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

export function buildImportsField(bundle: AnalyzedBundle, mainPackageJson: MainPackageJson): ImportsField | undefined {
    const referencedSpecifiers = getHashImportSpecifiers(bundle);
    if (referencedSpecifiers.size === 0) {
        return undefined;
    }

    const configuredImports = getConfiguredImportsOrThrow(mainPackageJson, referencedSpecifiers);
    return collectReferencedImportsEntries(referencedSpecifiers, configuredImports);
}
