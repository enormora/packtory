import { isPlainObject } from 'remeda';
import { tryOr } from 'true-myth/result';
import { bundleRelativePath, packageManifestFilePath } from '../common/package-layout.ts';
import { serializeStableJavaScriptObjectNotation } from '../common/stable-structured-data.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import * as inventory from '../software-bill-of-materials/software-bill-of-materials-canonicalizer.ts';

function canonicalizeManifestContent(content: string): string {
    const parsedResult = tryOr(undefined, function () {
        return JSON.parse(content) as unknown;
    });
    if (parsedResult.isErr) {
        return content;
    }
    const parsed = parsedResult.value;
    if (!isPlainObject(parsed)) {
        return content;
    }

    const withoutGitHead = { ...parsed };
    delete withoutGitHead.gitHead;
    return serializeStableJavaScriptObjectNotation(withoutGitHead);
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
    return canonicalizePackageManifestInFileSet(inventory.canonicalizeSoftwareBillOfMaterialsInFileSet(files));
}
