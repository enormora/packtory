import { isPlainObject } from 'remeda';
import { serializeStableJson } from '../common/stable-json.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { canonicalizeSbomInFileSet } from '../sbom/sbom-canonicalizer.ts';

const manifestPaths = new Set(['package.json', 'package/package.json']);

function canonicalizeManifestContent(content: string): string {
    try {
        const parsed: unknown = JSON.parse(content);
        if (!isPlainObject(parsed)) {
            return content;
        }
        const withoutGitHead = { ...parsed };
        delete withoutGitHead.gitHead;
        return serializeStableJson(withoutGitHead);
    } catch {
        return content;
    }
}

function canonicalizePackageManifestInFileSet(files: readonly FileDescription[]): readonly FileDescription[] {
    return files.map((file) => {
        if (!manifestPaths.has(file.filePath)) {
            return file;
        }
        return { ...file, content: canonicalizeManifestContent(file.content) };
    });
}

export function canonicalizeReleaseArtifactFiles(files: readonly FileDescription[]): readonly FileDescription[] {
    return canonicalizePackageManifestInFileSet(canonicalizeSbomInFileSet(files));
}
