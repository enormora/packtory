import path from 'node:path';

function sideEffectAssetExtensions(): readonly string[] {
    return [ '.css', '.less', '.sass', '.scss' ];
}

export function sideEffectAssetImportKind(specifier: string): string | undefined {
    const extension = path.extname(specifier);
    if (sideEffectAssetExtensions().includes(extension)) {
        return `${extension.slice(1)} import`;
    }
    return undefined;
}
