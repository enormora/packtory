import { isString } from 'remeda';
import type { FileSystemHost } from 'ts-morph';
import { isInstalledDependencyManifestPath } from '../common/package-layout.ts';
import { bindRequiredMethod, syncMethodNames } from './host-method-binding.ts';

const packageJsonIndentationSpaces = 2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && !Array.isArray(value);
}

function injectTypesCondition(_key: string, value: unknown): unknown {
    if (!isPlainObject(value)) {
        return value;
    }
    const target = value.import ?? value.default;
    if (!isString(target)) {
        return value;
    }
    return { types: target, ...value };
}

function rewriteManifestContent(content: string): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- JSON.parse returns any; the catch handles structural mismatch at runtime
        const parsed: Record<string, unknown> = JSON.parse(content);
        const rewrittenExports: unknown = JSON.parse(JSON.stringify(parsed.exports, injectTypesCondition));
        return JSON.stringify({ ...parsed, exports: rewrittenExports }, null, packageJsonIndentationSpaces);
    } catch {
        return content;
    }
}

export function createNodeModulesManifestSynthesizingHost(fileSystemHost: FileSystemHost): FileSystemHost {
    const readFileSync = bindRequiredMethod(fileSystemHost, syncMethodNames.readFile, 'a string', isString);

    const synthesizingHost: FileSystemHost = {
        ...fileSystemHost,
        readFile: async (filePath: string, encoding?: string): Promise<string> => {
            const content = await fileSystemHost.readFile(filePath, encoding);
            if (!isInstalledDependencyManifestPath(filePath)) {
                return content;
            }
            return rewriteManifestContent(content);
        },
        [syncMethodNames.readFile]: (filePath: string): string => {
            // eslint-disable-next-line node/no-sync -- the ts-morph host interface requires this synchronous method
            const content = readFileSync(filePath);
            if (!isInstalledDependencyManifestPath(filePath)) {
                return content;
            }
            return rewriteManifestContent(content);
        }
    };
    Object.setPrototypeOf(synthesizingHost, fileSystemHost);
    return synthesizingHost;
}
