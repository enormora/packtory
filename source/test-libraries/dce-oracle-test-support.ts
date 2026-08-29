import assert from 'node:assert';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EliminationInput } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';
import { createTestEliminator } from './eliminator-fixtures.ts';
import { runNodeProbe } from './run-node-probe.ts';

export type DceOracleEntry = {
    readonly bundleName: string;
    readonly targetFilePath: string;
    readonly exportName: string;
};

export type DceOracleCase = {
    readonly name: string;
    readonly entry: DceOracleEntry;
    readonly eliminationInputs: readonly EliminationInput[];
};

type DceProbeResult = {
    readonly value: unknown;
    readonly events: readonly unknown[];
};

type WritableBundle = {
    readonly name: string;
    readonly contents: readonly {
        readonly fileDescription: {
            readonly targetFilePath: string;
            readonly content: string;
        };
    }[];
};

type PackageFileManager = Pick<FileManager, 'writeFile'>;

type PackageWriter = {
    readonly writeResource: (resource: WritableBundle['contents'][number]) => Promise<void>;
};

type WrittenPackages = {
    readonly original: string;
    readonly eliminated: string;
};

const packageJsonContent = '{"type":"module"}\n';

function entryContext(input: DceOracleCase): string {
    return `${input.name}: ${input.entry.bundleName}/${input.entry.targetFilePath}#${input.entry.exportName}`;
}

function verifyEntryBundle(input: DceOracleCase, bundles: readonly WritableBundle[], phase: string): void {
    const bundle = bundles.find(function (candidate) {
        return candidate.name === input.entry.bundleName;
    });
    assert.notStrictEqual(bundle, undefined, `${entryContext(input)} missing ${phase} entry bundle`);
    const resource = bundle?.contents.find(function (candidate) {
        return candidate.fileDescription.targetFilePath === input.entry.targetFilePath;
    });
    assert.notStrictEqual(resource, undefined, `${entryContext(input)} missing ${phase} entry file`);
}

function assertSafeTargetPath(targetFilePath: string, caseName: string): void {
    const normalizedTargetPath = path.posix.normalize(targetFilePath);
    assert.strictEqual(path.isAbsolute(targetFilePath), false, `${caseName}: target path must be relative`);
    assert.strictEqual(
        normalizedTargetPath === '..' || normalizedTargetPath.startsWith('../'),
        false,
        `${caseName}: target path must stay inside package`
    );
}

function createPackageWriter(
    fileManager: PackageFileManager,
    packageFolder: string,
    caseName: string
): PackageWriter {
    const writtenPaths = new Set<string>();

    return {
        async writeResource(resource) {
            const { targetFilePath, content } = resource.fileDescription;
            assertSafeTargetPath(targetFilePath, caseName);
            assert.strictEqual(
                writtenPaths.has(targetFilePath),
                false,
                `${caseName}: duplicate target path ${targetFilePath}`
            );
            writtenPaths.add(targetFilePath);
            await fileManager.writeFile(path.join(packageFolder, targetFilePath), content);
        }
    };
}

async function writeBundleResources(
    packageWriter: PackageWriter,
    bundles: readonly WritableBundle[]
): Promise<void> {
    for (const bundle of bundles) {
        for (const resource of bundle.contents) {
            await packageWriter.writeResource(resource);
        }
    }
}

async function writePackage(caseName: string, bundles: readonly WritableBundle[]): Promise<string> {
    const fileManager = createFileManager({ hostFileSystem: fs.promises });
    const packageFolder = await mkdtemp(path.join(tmpdir(), 'packtory-dce-oracle-'));
    const packageWriter = createPackageWriter(fileManager, packageFolder, caseName);
    await fileManager.writeFile(path.join(packageFolder, 'package.json'), packageJsonContent);
    await writeBundleResources(packageWriter, bundles);
    return packageFolder;
}

function probeScript(entryUrl: string, exportName: string): string {
    return [
        'globalThis.__packtoryDceEvents = [];',
        `const module = await import(${JSON.stringify(entryUrl)});`,
        `const exported = module[${JSON.stringify(exportName)}];`,
        'const value = typeof exported === "function" ? await exported() : exported;',
        'console.log(JSON.stringify({ value, events: globalThis.__packtoryDceEvents }));'
    ]
        .join('\n');
}

async function runPackageProbe(packageFolder: string, entry: DceOracleEntry): Promise<DceProbeResult> {
    const entryUrl = pathToFileURL(path.join(packageFolder, entry.targetFilePath)).href;
    const result = await runNodeProbe(probeScript(entryUrl, entry.exportName));

    assert.deepStrictEqual(
        Object.keys(result as Record<string, unknown>).toSorted(function (left, right) {
            return left.localeCompare(right);
        }),
        [ 'events', 'value' ],
        'DCE oracle probe returned an unexpected shape'
    );

    return result as DceProbeResult;
}

function originalBundles(input: DceOracleCase): readonly WritableBundle[] {
    return input.eliminationInputs.map(function (eliminationInput) {
        return eliminationInput.bundle;
    });
}

function wrapFailure(input: DceOracleCase, phase: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${entryContext(input)} failed during ${phase}: ${message}`, { cause: error });
}

async function removePackageFolder(packageFolder: string): Promise<void> {
    await rm(packageFolder, { recursive: true, force: true });
}

async function withWrittenPackages<T>(
    caseName: string,
    original: readonly WritableBundle[],
    eliminated: readonly WritableBundle[],
    action: (packages: WrittenPackages) => Promise<T>
): Promise<T> {
    const originalPackageFolder = await writePackage(caseName, original);
    try {
        const eliminatedPackageFolder = await writePackage(caseName, eliminated);
        try {
            return await action({ original: originalPackageFolder, eliminated: eliminatedPackageFolder });
        } finally {
            await removePackageFolder(eliminatedPackageFolder);
        }
    } finally {
        await removePackageFolder(originalPackageFolder);
    }
}

async function comparePackageBehavior(input: DceOracleCase, packages: WrittenPackages): Promise<void> {
    const originalResult = await runPackageProbe(packages.original, input.entry);
    const eliminatedResult = await runPackageProbe(packages.eliminated, input.entry);
    assert.deepStrictEqual(
        eliminatedResult,
        originalResult,
        `${entryContext(input)} changed observable behavior`
    );
}

export async function assertDceEquivalent(input: DceOracleCase): Promise<void> {
    try {
        const original = originalBundles(input);
        const eliminated = await createTestEliminator().eliminate(input.eliminationInputs);

        verifyEntryBundle(input, original, 'original');
        verifyEntryBundle(input, eliminated, 'eliminated');

        await withWrittenPackages(input.name, original, eliminated, async function (packages) {
            await comparePackageBehavior(input, packages);
        });
    } catch (error: unknown) {
        throw wrapFailure(input, 'oracle comparison', error);
    }
}
