import { isArray, isPlainObject } from 'remeda';
import { serializeStableJson } from '../common/stable-json.ts';
import type { FileDescription } from '../file-manager/file-description.ts';

const sbomFilePath = 'sbom.cdx.json';
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

function canonicalizeSbomContent(content: string): string {
    try {
        const parsed: unknown = JSON.parse(content);
        stripPacktoryVersion(parsed);
        return serializeStableJson(parsed);
    } catch {
        return content;
    }
}

export function canonicalizeSbomInFileSet(files: readonly FileDescription[]): readonly FileDescription[] {
    return files.map((file) => {
        if (file.filePath !== sbomFilePath) {
            return file;
        }
        return { ...file, content: canonicalizeSbomContent(file.content) };
    });
}
