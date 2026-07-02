import { isPlainObject, isString } from 'remeda';
import { tryOr } from 'true-myth/result';
import type { FileSystemHost } from 'ts-morph';
import { isInstalledDependencyManifestPath } from '../common/package-layout.ts';
import { bindRequiredMethod, syncMethodNames } from './host-method-binding.ts';

const packageJsonIndentationSpaces = 2;

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
    const parsedResult = tryOr(undefined, function () {
        return JSON.parse(content) as unknown;
    });
    if (parsedResult.isErr) {
        return content;
    }
    const parsed = parsedResult.value;
    if (!isPlainObject(parsed) || !Object.hasOwn(parsed, 'exports')) {
        return content;
    }
    const rewrittenExports: unknown = JSON.parse(JSON.stringify(parsed.exports, injectTypesCondition));

    return JSON.stringify({ ...parsed, exports: rewrittenExports }, null, packageJsonIndentationSpaces);
}

export function createNodeModulesManifestSynthesizingHost(fileSystemHost: FileSystemHost): FileSystemHost {
    const readFileSync = bindRequiredMethod(fileSystemHost, syncMethodNames.readFile, 'a string', isString);

    const synthesizingHost: FileSystemHost = {
        ...fileSystemHost,
        async readFile(filePath: string, encoding?: string): Promise<string> {
            const content = await fileSystemHost.readFile(filePath, encoding);
            if (!isInstalledDependencyManifestPath(filePath)) {
                return content;
            }
            return rewriteManifestContent(content);
        },
        [syncMethodNames.readFile](filePath: string): string {
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
