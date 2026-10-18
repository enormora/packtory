import { isArray, isPlainObject } from 'remeda';
import { bundleRelativePath, softwareBillOfMaterialsArtifactFilePath } from '../common/package-layout.ts';
import { serializeStableJavaScriptObjectNotation } from '../common/stable-structured-data.ts';
import type { FileDescription } from '../file-manager/file-description.ts';

const packtoryToolName = 'packtory';

function pluckObjectField(value: unknown, key: string): unknown {
    if (!isPlainObject(value)) {
        return undefined;
    }
    return value[key];
}

function resolveToolComponents(parsed: unknown): readonly unknown[] | undefined {
    const metadata = pluckObjectField(parsed, 'metadata');
    const tools = pluckObjectField(metadata, 'tools');
    const components = pluckObjectField(tools, 'components');
    return isArray(components) ? components : undefined;
}

function stripPacktoryVersion(parsed: unknown): void {
    const components = resolveToolComponents(parsed);
    if (components === undefined) {
        return;
    }
    for (const entry of components) {
        if (isPlainObject(entry) && entry.name === packtoryToolName) {
            delete entry.version;
        }
    }
}

function canonicalizeSoftwareBillOfMaterialsContent(content: string): string {
    try {
        const parsed: unknown = JSON.parse(content);
        stripPacktoryVersion(parsed);
        return serializeStableJavaScriptObjectNotation(parsed);
    } catch {
        return content;
    }
}

export function canonicalizeSoftwareBillOfMaterialsInFileSet(
    files: readonly FileDescription[]
): readonly FileDescription[] {
    return files.map(function (file) {
        if (bundleRelativePath(file.filePath) !== softwareBillOfMaterialsArtifactFilePath) {
            return file;
        }
        return { ...file, content: canonicalizeSoftwareBillOfMaterialsContent(file.content) };
    });
}
