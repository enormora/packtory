import { isPlainObject } from 'remeda';
import { bundleRelativePath, packageManifestFilePath } from '../common/package-layout.ts';
import { serializeStableJson } from '../common/stable-json.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { canonicalizeSbomInFileSet } from '../sbom/sbom-canonicalizer.ts';

type FailedJsonParseResult = { readonly success: false; };
type SuccessfulJsonParseResult = { readonly success: true; readonly value: unknown; };
type JsonParseResult = FailedJsonParseResult | SuccessfulJsonParseResult;

function parseJson(content: string): JsonParseResult {
    try {
        return { success: true, value: JSON.parse(content) as unknown };
    } catch {
        return { success: false };
    }
}

function canonicalizeManifestContent(content: string): string {
    const parsed = parseJson(content);
    if (!parsed.success || !isPlainObject(parsed.value)) {
        return content;
    }

    const withoutGitHead = { ...parsed.value };
    delete withoutGitHead.gitHead;
    return serializeStableJson(withoutGitHead);
}

function canonicalizePackageManifestInFileSet(files: readonly FileDescription[]): readonly FileDescription[] {
    return files.map(function (file) {
        if (bundleRelativePath(file.filePath) !== packageManifestFilePath) {
            return file;
        }
        return { ...file, content: canonicalizeManifestContent(file.content) };
    });
}

export function canonicalizeReleaseArtifactFiles(files: readonly FileDescription[]): readonly FileDescription[] {
    return canonicalizePackageManifestInFileSet(canonicalizeSbomInFileSet(files));
}
