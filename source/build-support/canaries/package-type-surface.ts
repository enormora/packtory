import path from 'node:path';
import { declarationCompanionCandidates } from '../../common/declaration-companion-paths.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { RuntimeExportTarget } from '../../packtory/published-artifact-smoke-gate.ts';

type PackageTypeSurfaceInput = {
    readonly exports: unknown;
    readonly fileManager: Pick<FileManager, 'checkReadability'>;
    readonly name: string;
    readonly packageFolder: string;
    readonly targets: readonly RuntimeExportTarget[];
    readonly types: unknown;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function hasTypeCondition(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.some(hasTypeCondition);
    }
    return isRecord(value) && Object.entries(value).some(function ([ condition, target ]) {
        return condition === 'types' || condition.startsWith('types@') || hasTypeCondition(target);
    });
}

function exportConditions(input: PackageTypeSurfaceInput, specifier: string): unknown {
    const exportPath = specifier === input.name ? '.' : `.${specifier.slice(input.name.length)}`;
    if (
        isRecord(input.exports) && Object.keys(input.exports).some(function (key) {
            return key.startsWith('.');
        })
    ) {
        return input.exports[exportPath];
    }
    return exportPath === '.' ? input.exports : undefined;
}

async function hasDeclarationCompanion(input: PackageTypeSurfaceInput, target: RuntimeExportTarget): Promise<boolean> {
    for (const candidate of declarationCompanionCandidates(target.targetFilePath)) {
        const readability = await input.fileManager.checkReadability(path.join(input.packageFolder, candidate));
        if (readability.isReadable) {
            return true;
        }
    }
    return false;
}

export async function typedExportSpecifiers(input: PackageTypeSurfaceInput): Promise<readonly string[]> {
    const specifiers: string[] = [];
    for (const target of input.targets) {
        if (
            hasTypeCondition(exportConditions(input, target.specifier)) ||
            target.specifier === input.name && typeof input.types === 'string' ||
            await hasDeclarationCompanion(input, target)
        ) {
            specifiers.push(target.specifier);
        }
    }
    return specifiers;
}
