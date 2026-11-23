import { z } from 'zod/mini';
import { safeParse } from '../../common/schema-validation.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';

const commandSchema = z.string().check(z.minLength(1));
const canaryFields = z.strictObject({
    failureMode: z.literal('non-blocking'),
    installCommand: commandSchema,
    name: z.string().check(z.minLength(1)),
    packBudgetMilliseconds: z.int().check(z.positive()),
    reference: z.string().check(z.minLength(1)),
    repository: z.string().check(z.minLength(1)),
    verificationCommands: z.readonly(z.array(commandSchema))
});

export type Canary = Readonly<z.infer<typeof canaryFields> & (
    { readonly buildCommand: string } | { readonly publishCommand: string }
)>;

const canarySchema = z.readonly(z.pipe(
    z.extend(canaryFields, {
        buildCommand: z.optional(commandSchema),
        publishCommand: z.optional(commandSchema)
    }),
    z.transform(function ({ buildCommand, publishCommand, ...canary }, context): Canary {
        if (buildCommand !== undefined && publishCommand === undefined) {
            return { ...canary, buildCommand };
        }
        if (publishCommand !== undefined && buildCommand === undefined) {
            return { ...canary, publishCommand };
        }
        context.issues.push({
            code: 'custom',
            input: canary,
            message: 'Specify exactly one of buildCommand and publishCommand'
        });
        return z.NEVER;
    })
));

const manifestSchema = z.readonly(z.array(canarySchema));
export type CanaryManifest = readonly Canary[];

function duplicateNames(manifest: CanaryManifest): readonly string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const entry of manifest) {
        if (seen.has(entry.name)) {
            duplicates.add(entry.name);
        }
        seen.add(entry.name);
    }
    return Array.from(duplicates).toSorted(function (left, right) {
        return left.localeCompare(right);
    });
}

function parseCanaryManifest(content: string): CanaryManifest {
    const parsedContent: unknown = JSON.parse(content);
    const result = safeParse(manifestSchema, parsedContent);
    if (!result.success) {
        throw new Error(result.error.message);
    }
    const duplicates = duplicateNames(result.data);
    if (duplicates.length > 0) {
        throw new Error(`Duplicate canary names: ${duplicates.join(', ')}`);
    }
    return result.data;
}

export async function readCanaryManifest(
    manifestPath: string,
    fileManager: Pick<FileManager, 'readFile'>
): Promise<CanaryManifest> {
    return parseCanaryManifest(await fileManager.readFile(manifestPath));
}

export function selectCanary(manifest: CanaryManifest, name: string): Canary {
    const canary = manifest.find(function (entry) {
        return entry.name === name;
    });
    if (canary === undefined) {
        throw new Error(`Canary "${name}" is not declared in the manifest`);
    }
    return canary;
}
