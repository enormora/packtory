import assert from 'node:assert';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
    AnalyzedBundle,
    AnalyzedBundleResource,
    EliminationInput
} from '../dead-code-eliminator/analyzed-bundle.ts';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';
import { assertValidDeadCodeEliminationOutput } from './dead-code-elimination-invariant-assertions.ts';
import { createTestEliminator } from './eliminator-fixtures.ts';
import { runNodeProbe } from './run-node-probe.ts';

export type DeadCodeEliminationOracleEntry = {
    readonly bundleName: string;
    readonly targetFilePath: string;
    readonly exportName: string;
};

export type DeadCodeEliminationOracleCase = {
    readonly name: string;
    readonly entry: DeadCodeEliminationOracleEntry;
    readonly eliminationInputs: readonly EliminationInput[];
};

export type DeadCodeEliminationBehaviorComparison = {
    readonly name: string;
    readonly entry: DeadCodeEliminationOracleEntry;
    readonly leftName: string;
    readonly leftBundles: readonly WritableBundle[];
    readonly rightName: string;
    readonly rightBundles: readonly WritableBundle[];
};

type DeadCodeEliminationProbeResult = {
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

type RootFileDescription = AnalyzedBundle['roots'][string];
type RootTransferableFileDescription = RootFileDescription['js'];
type SecondPassBundle = EliminationInput['bundle'];

type WrittenComparisonPackages = {
    readonly left: string;
    readonly right: string;
};

const packageJsonContent = '{"type":"module"}\n';

function entryContext(name: string, entry: DeadCodeEliminationOracleEntry): string {
    return `${name}: ${entry.bundleName}/${entry.targetFilePath}#${entry.exportName}`;
}

function verifyEntryBundle(
    name: string,
    entry: DeadCodeEliminationOracleEntry,
    bundles: readonly WritableBundle[],
    phase: string
): void {
    const bundle = bundles.find(function (candidate) {
        return candidate.name === entry.bundleName;
    });
    assert.notStrictEqual(bundle, undefined, `${entryContext(name, entry)} missing ${phase} entry bundle`);
    const resource = bundle?.contents.find(function (candidate) {
        return candidate.fileDescription.targetFilePath === entry.targetFilePath;
    });
    assert.notStrictEqual(resource, undefined, `${entryContext(name, entry)} missing ${phase} entry file`);
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
    fileManager: PackageFileManager,
    packageFolder: string,
    caseName: string,
    bundles: readonly WritableBundle[]
): Promise<void> {
    for (const bundle of bundles) {
        const bundleFolder = path.join(packageFolder, 'node_modules', bundle.name);
        const packageWriter = createPackageWriter(fileManager, bundleFolder, caseName);
        await fileManager.writeFile(path.join(bundleFolder, 'package.json'), packageJsonContent);
        for (const resource of bundle.contents) {
            await packageWriter.writeResource(resource);
        }
    }
}

async function writePackage(caseName: string, bundles: readonly WritableBundle[]): Promise<string> {
    const fileManager = createFileManager({ hostFileSystem: fs.promises });
    const packageFolder = await fs.promises.mkdtemp(path.join(tmpdir(), 'packtory-dead-code-elimination-oracle-'));
    await fileManager.writeFile(path.join(packageFolder, 'package.json'), packageJsonContent);
    await writeBundleResources(fileManager, packageFolder, caseName, bundles);
    return packageFolder;
}

function probeScript(entryUrl: string, exportName: string): string {
    return [
        'globalThis.__packtoryDeadCodeEliminationEvents = [];',
        `const module = await import(${JSON.stringify(entryUrl)});`,
        `const exported = module[${JSON.stringify(exportName)}];`,
        'const value = typeof exported === "function" ? await exported() : exported;',
        'console.log(JSON.stringify({ value, events: globalThis.__packtoryDeadCodeEliminationEvents }));'
    ]
        .join('\n');
}

async function runPackageProbe(
    packageFolder: string,
    entry: DeadCodeEliminationOracleEntry
): Promise<DeadCodeEliminationProbeResult> {
    const entryUrl = pathToFileURL(
        path.join(packageFolder, 'node_modules', entry.bundleName, entry.targetFilePath)
    )
        .href;
    const result = await runNodeProbe(probeScript(entryUrl, entry.exportName));

    assert.deepStrictEqual(
        Object.keys(result as Record<string, unknown>).toSorted(function (left, right) {
            return left.localeCompare(right);
        }),
        [ 'events', 'value' ],
        'dead code elimination oracle probe returned an unexpected shape'
    );

    return result as DeadCodeEliminationProbeResult;
}

function originalBundles(input: DeadCodeEliminationOracleCase): readonly WritableBundle[] {
    return input.eliminationInputs.map(function (eliminationInput) {
        return eliminationInput.bundle;
    });
}

function entryBundles(
    input: DeadCodeEliminationOracleCase,
    bundles: readonly AnalyzedBundle[]
): readonly AnalyzedBundle[] {
    return bundles.filter(function (bundle) {
        return bundle.name === input.entry.bundleName;
    });
}

function wrapFailure(input: DeadCodeEliminationOracleCase, phase: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${entryContext(input.name, input.entry)} failed during ${phase}: ${message}`, {
        cause: error
    });
}

async function removePackageFolder(packageFolder: string): Promise<void> {
    await fs.promises.rm(packageFolder, { recursive: true, force: true });
}

async function withWrittenComparisonPackages<T>(
    caseName: string,
    left: readonly WritableBundle[],
    right: readonly WritableBundle[],
    action: (packages: WrittenComparisonPackages) => Promise<T>
): Promise<T> {
    const leftPackageFolder = await writePackage(caseName, left);
    try {
        const rightPackageFolder = await writePackage(caseName, right);
        try {
            return await action({ left: leftPackageFolder, right: rightPackageFolder });
        } finally {
            await removePackageFolder(rightPackageFolder);
        }
    } finally {
        await removePackageFolder(leftPackageFolder);
    }
}

async function comparePackageBehavior(
    input: DeadCodeEliminationBehaviorComparison,
    packages: WrittenComparisonPackages
): Promise<void> {
    const leftResult = await runPackageProbe(packages.left, input.entry);
    const rightResult = await runPackageProbe(packages.right, input.entry);
    assert.deepStrictEqual(
        rightResult,
        leftResult,
        `${
            entryContext(
                input.name,
                input.entry
            )
        } changed observable behavior from ${input.leftName} to ${input.rightName}`
    );
}

export async function assertDeadCodeEliminationBehaviorEquivalent(
    input: DeadCodeEliminationBehaviorComparison
): Promise<void> {
    verifyEntryBundle(input.name, input.entry, input.leftBundles, input.leftName);
    verifyEntryBundle(input.name, input.entry, input.rightBundles, input.rightName);
    await withWrittenComparisonPackages(input.name, input.leftBundles, input.rightBundles, async function (packages) {
        await comparePackageBehavior(input, packages);
    });
}

async function eliminateDeadCodeForOracle(
    input: DeadCodeEliminationOracleCase
): Promise<readonly AnalyzedBundle[]> {
    const eliminated = await createTestEliminator().eliminate(input.eliminationInputs);
    verifyEntryBundle(input.name, input.entry, eliminated, 'eliminated');
    assertValidDeadCodeEliminationOutput(input.name, entryBundles(input, eliminated));
    return eliminated;
}

export async function eliminateDeadCodeAndAssertAllOutputValid(
    input: DeadCodeEliminationOracleCase
): Promise<readonly AnalyzedBundle[]> {
    const eliminated = await eliminateDeadCodeForOracle(input);
    assertValidDeadCodeEliminationOutput(input.name, eliminated);
    return eliminated;
}

export async function assertDeadCodeEliminationEquivalent(
    input: DeadCodeEliminationOracleCase
): Promise<void> {
    try {
        const original = originalBundles(input);
        const eliminated = await eliminateDeadCodeForOracle(input);

        verifyEntryBundle(input.name, input.entry, original, 'original');
        assertValidDeadCodeEliminationOutput(input.name, entryBundles(input, eliminated));
        await assertDeadCodeEliminationBehaviorEquivalent({
            name: input.name,
            entry: input.entry,
            leftName: 'original',
            leftBundles: original,
            rightName: 'eliminated',
            rightBundles: eliminated
        });
    } catch (error: unknown) {
        throw wrapFailure(input, 'oracle comparison', error);
    }
}

function targetPathsFor(bundle: WritableBundle): readonly string[] {
    return bundle
        .contents
        .map(function (resource) {
            return resource.fileDescription.targetFilePath;
        })
        .toSorted(function (left, right) {
            return left.localeCompare(right);
        });
}

function assertTargetPathsEqual(
    caseName: string,
    left: readonly WritableBundle[],
    right: readonly WritableBundle[]
): void {
    for (const leftBundle of left) {
        const rightBundle = right.find(function (candidate) {
            return candidate.name === leftBundle.name;
        });
        if (rightBundle === undefined) {
            assert.fail(`${caseName}: missing second-pass bundle ${leftBundle.name}`);
        }
        assert.deepStrictEqual(
            targetPathsFor(rightBundle),
            targetPathsFor(leftBundle),
            `${caseName}: second pass changed target paths for ${leftBundle.name}`
        );
    }
}

function resourceForRoot(
    bundle: AnalyzedBundle,
    fileDescription: RootTransferableFileDescription
): AnalyzedBundleResource {
    const resource = bundle.contents.find(function (candidate) {
        return candidate.fileDescription.sourceFilePath === fileDescription.sourceFilePath;
    }) ?? bundle.contents.find(function (candidate) {
        return candidate.fileDescription.targetFilePath === fileDescription.targetFilePath;
    });
    if (resource === undefined) {
        throw new Error(`${bundle.name}: emitted output is missing root ${fileDescription.targetFilePath}`);
    }
    return resource;
}

function refreshFileDescription(
    bundle: AnalyzedBundle,
    fileDescription: RootTransferableFileDescription
): RootTransferableFileDescription {
    const resource = resourceForRoot(bundle, fileDescription);
    return {
        ...fileDescription,
        content: resource.fileDescription.content,
        sourceFilePath: resource.fileDescription.sourceFilePath,
        targetFilePath: resource.fileDescription.targetFilePath
    };
}

function refreshRoot(bundle: AnalyzedBundle, root: RootFileDescription): RootFileDescription {
    if (root.declarationFile === undefined) {
        return { js: refreshFileDescription(bundle, root.js) };
    }
    return {
        js: refreshFileDescription(bundle, root.js),
        declarationFile: refreshFileDescription(bundle, root.declarationFile)
    };
}

function refreshRoots(bundle: AnalyzedBundle): Readonly<Record<string, RootFileDescription>> {
    return Object.fromEntries(
        Object.entries(bundle.roots).map(function ([ rootId, root ]) {
            return [ rootId, refreshRoot(bundle, root) ];
        })
    );
}

function linkedBundleForSecondPass(bundle: AnalyzedBundle): SecondPassBundle {
    return {
        ...bundle,
        contents: bundle.contents,
        roots: refreshRoots(bundle)
    };
}

function secondPassInputs(
    input: DeadCodeEliminationOracleCase,
    firstPass: readonly AnalyzedBundle[]
): readonly EliminationInput[] {
    return input.eliminationInputs.map(function (eliminationInput) {
        const analyzed = firstPass.find(function (bundle) {
            return bundle.name === eliminationInput.bundle.name;
        });
        if (analyzed === undefined) {
            assert.fail(`${input.name}: missing first-pass bundle ${eliminationInput.bundle.name}`);
        }
        return {
            ...eliminationInput,
            bundle: linkedBundleForSecondPass(analyzed)
        };
    });
}

export async function assertDeadCodeEliminationIdempotent(
    input: DeadCodeEliminationOracleCase
): Promise<void> {
    try {
        const firstPass = await eliminateDeadCodeForOracle(input);
        const secondPass = await createTestEliminator().eliminate(secondPassInputs(input, firstPass));

        verifyEntryBundle(input.name, input.entry, secondPass, 'second-pass eliminated');
        assertValidDeadCodeEliminationOutput(input.name, secondPass);
        assertTargetPathsEqual(input.name, firstPass, secondPass);
        await assertDeadCodeEliminationBehaviorEquivalent({
            name: input.name,
            entry: input.entry,
            leftName: 'once eliminated',
            leftBundles: firstPass,
            rightName: 'twice eliminated',
            rightBundles: secondPass
        });
    } catch (error: unknown) {
        throw wrapFailure(input, 'idempotence comparison', error);
    }
}
