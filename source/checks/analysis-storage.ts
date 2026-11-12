import path from 'node:path';
import { z } from 'zod/mini';
import type { $ZodType, output as SchemaOutput } from 'zod/v4/core';
import type { FileManager } from '../file-manager/file-manager.ts';
import { contentDigest } from '../common/value-fingerprint.ts';

export type AnalysisStorage = {
    readonly read: <Schema extends $ZodType>(key: unknown, schema: Schema) => Promise<SchemaOutput<Schema> | null>;
    readonly write: (key: unknown, value: unknown) => Promise<boolean>;
};
type StorageDependencies = {
    readonly fileManager: FileManager;
    readonly repositoryFolder: string;
    readonly toolIdentity: () => Promise<string>;
};
const maximumRetainedResults = 32;
const storedAnalysisSchema = z.object({ content: z.string(), digest: z.string() });

function parseStored<Schema extends $ZodType>(schema: Schema, content: string): SchemaOutput<Schema> | null {
    const parsed: unknown = JSON.parse(content);
    const stored = z.parse(storedAnalysisSchema, parsed);
    if (contentDigest(stored.content) !== stored.digest) {
        return null;
    }
    const value: unknown = JSON.parse(stored.content);
    const result = z.safeParse(schema, value);
    return result.success ? result.data : null;
}

export function createAnalysisStorage(dependencies: StorageDependencies): AnalysisStorage {
    const { fileManager } = dependencies;
    const memory = new Map<string, string>();
    async function location(key: unknown): Promise<string> {
        const identity = [ await dependencies.toolIdentity(), key ];
        return path.join(
            dependencies.repositoryFolder,
            'node_modules/.cache/packtory',
            `${contentDigest(JSON.stringify(identity))}.json`
        );
    }
    async function load(key: unknown): Promise<string> {
        const filePath = await location(key);
        return memory.get(filePath) ?? await fileManager.readFile(filePath);
    }
    async function persist(key: unknown, value: unknown): Promise<void> {
        const filePath = await location(key);
        const payload = JSON.stringify(value);
        const content = JSON.stringify({ content: payload, digest: contentDigest(payload) });
        memory.set(filePath, content);
        if (memory.size > maximumRetainedResults) {
            memory.clear();
        }
        await fileManager.writeFile(filePath, content);
    }
    return {
        async read(key, schema) {
            try {
                return parseStored(schema, await load(key));
            } catch {
                return null;
            }
        },
        async write(key, value) {
            try {
                await persist(key, value);
                return true;
            } catch {
                return false;
            }
        }
    };
}
