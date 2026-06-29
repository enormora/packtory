import { isPlainObject } from 'remeda';
import { tryOr } from 'true-myth/result';
import { bundleRelativePath, packageManifestFilePath } from '../common/package-layout.ts';
import { serializeStableJson } from '../common/stable-json.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { canonicalizeSbomInFileSet } from '../sbom/sbom-canonicalizer.ts';

function canonicalizeManifestContent(content: string): string {
    return tryOr(content, function () {
        return JSON.parse(content) as unknown;
    })
        .mapOr(content, function (parsed) {
            if (!isPlainObject(parsed)) {
                return content;
            }

            const withoutGitHead = { ...parsed };
            delete withoutGitHead.gitHead;
            return serializeStableJson(withoutGitHead);
        });
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
