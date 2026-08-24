import path from 'node:path';

const sideEffectAssetExtensions = new Set([ '.css', '.less', '.sass', '.scss' ]);

export function sideEffectAssetImportKind(specifier: string): string | undefined {
    const extension = path.extname(specifier);
    if (!sideEffectAssetExtensions.has(extension)) {
        return undefined;
    }
    return `${extension.slice(1)} import`;
}
