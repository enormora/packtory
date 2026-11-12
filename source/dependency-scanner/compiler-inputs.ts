import path from 'node:path';
import { z } from 'zod/mini';
import type { FileSystemHost } from 'ts-morph';
import type { FileManager } from '../file-manager/file-manager.ts';
import { contentDigest } from '../common/value-fingerprint.ts';

const operations = [ 'readFile', 'fileExists', 'directoryExists', 'readDir', 'realpath' ] as const;
type Operation = (typeof operations)[number];
export const compilerInputsSchema = z.array(z.object({
    operation: z.enum(operations),
    filePath: z.string(),
    value: z.string()
}));
export type CompilerInputs = Readonly<z.infer<typeof compilerInputsSchema>>;
type CompilerInput = Readonly<CompilerInputs[number]>;
export type CompilerInputObservation = {
    readonly fileSystemHost: FileSystemHost;
    readonly snapshot: () => CompilerInputs | null;
};
const directoryEntriesSchema = z.array(z.object({
    name: z.string(),
    isDirectory: z.boolean(),
    isSymlink: z.boolean()
}));
const directoryFilesSchema = z.array(z.object({
    name: z.string(),
    isFile: z.boolean(),
    isSymlink: z.boolean()
}));

function observedValue(operation: Operation, value: unknown): string {
    if (operation === 'readFile' && typeof value === 'string') {
        return contentDigest(value);
    }
    if (operation === 'readDir') {
        return JSON.stringify(
            directoryEntriesSchema.parse(value).toSorted(function (left, right) {
                return left.name.localeCompare(right.name);
            })
        );
    }
    return JSON.stringify(value);
}

export function observeCompilerInputs(fileSystemHost: FileSystemHost): CompilerInputObservation {
    const inputs = new Map<string, CompilerInput>();
    let reusable = true;
    function record(operation: Operation, filePath: string, value: string): void {
        const key = `${operation}:${filePath}`;
        const previous = inputs.get(key);
        reusable = reusable && (previous === undefined || previous.value === value);
        inputs.set(key, { operation, filePath, value });
    }
    function recordLinkedFiles(value: unknown): void {
        for (const entry of directoryFilesSchema.parse(value)) {
            if (entry.isSymlink) {
                record('fileExists', entry.name, JSON.stringify(entry.isFile));
            }
        }
    }
    function recordValue(operation: Operation, filePath: string, result: unknown): void {
        if (operation === 'readDir') {
            recordLinkedFiles(result);
        }
        record(operation, filePath, observedValue(operation, result));
    }
    function recordResult(operation: Operation, filePath: string, result: unknown): unknown {
        if (result instanceof Promise) {
            reusable = false;
        } else {
            try {
                recordValue(operation, filePath, result);
            } catch {
                reusable = false;
            }
        }
        return result;
    }
    function captureRead(operation: Operation, filePath: string, read: () => unknown): unknown {
        try {
            return recordResult(operation, filePath, read());
        } catch (error: unknown) {
            record(operation, filePath, 'unreadable');
            throw error;
        }
    }
    return {
        snapshot() {
            return reusable ? Array.from(inputs.values()) : null;
        },
        fileSystemHost: new Proxy(fileSystemHost, {
            get(target, property) {
                const member: unknown = Reflect.get(target, property);
                if (typeof member !== 'function') {
                    return member;
                }
                return function (...parameters: readonly unknown[]): unknown {
                    const method = String(property).replace(/Sync$/u, '');
                    const operation = operations.find(function (candidate) {
                        return candidate === method;
                    });
                    const [ filePath ] = parameters;
                    if (operation === undefined || typeof filePath !== 'string') {
                        reusable = reusable && ![ 'glob', 'globSync' ].includes(String(property));
                        return Reflect.apply(member, target, parameters);
                    }
                    return captureRead(operation, filePath, function () {
                        return Reflect.apply(member, target, parameters);
                    });
                };
            }
        })
    };
}

async function currentValue(fileManager: FileManager, input: CompilerInput): Promise<string> {
    const { operation, filePath } = input;
    if (operation === 'readFile') {
        return contentDigest(await fileManager.readFile(filePath));
    }
    if (operation === 'realpath') {
        return JSON.stringify(await fileManager.getRealPath(filePath));
    }
    if (operation === 'readDir') {
        const entries = await fileManager.listDirectoryEntries(filePath);
        return observedValue(
            operation,
            await Promise.all(entries.map(async function (entry) {
                const entryPath = path.join(filePath, entry.name);
                const target = entry.isSymbolicLink ? await fileManager.checkDirectory(entryPath) : undefined;
                return {
                    name: entryPath,
                    isDirectory: target?.exists === true ? target.isDirectory : entry.isDirectory,
                    isSymlink: entry.isSymbolicLink
                };
            }))
        );
    }
    const status = await fileManager.checkDirectory(filePath);
    return JSON.stringify(
        status.exists && (operation === 'directoryExists' ? status.isDirectory : !status.isDirectory)
    );
}

async function inputIsCurrent(fileManager: FileManager, input: CompilerInput): Promise<boolean> {
    try {
        return await currentValue(fileManager, input) === input.value;
    } catch {
        return input.value === 'unreadable';
    }
}

export async function compilerInputsAreCurrent(fileManager: FileManager, inputs: CompilerInputs): Promise<boolean> {
    for (const input of inputs) {
        if (!await inputIsCurrent(fileManager, input)) {
            return false;
        }
    }
    return true;
}
