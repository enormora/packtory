import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { serializeStableJson } from '../common/stable-json.ts';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';
import { createTestEliminator } from './eliminator-fixtures.ts';
import { inputs } from './eliminator-test-support.ts';

type ContainsTextAssertion = {
    readonly type: 'contains-text';
    readonly targetFilePath: string;
    readonly text: string;
};

type OmitsTextAssertion = {
    readonly type: 'omits-text';
    readonly targetFilePath: string;
    readonly text: string;
};

export type SourceMapSourcesAssertion = {
    readonly type: 'source-map-sources';
    readonly targetFilePath: string;
    readonly sources: readonly string[];
};

export type DeadCodeEliminationTextAssertion = ContainsTextAssertion | OmitsTextAssertion;
export type DeadCodeEliminationContentAssertion = DeadCodeEliminationTextAssertion | SourceMapSourcesAssertion;

type DeadCodeEliminationArtifactResource = {
    readonly fixtureFilePath: string;
    readonly inputFilePath: string;
    readonly targetFilePath: string;
};

export type DeadCodeEliminationConsumerProducerApiCase = {
    readonly type: 'consumer-producer-api';
    readonly id: string;
    readonly fixture: string;
    readonly entryPackage: string;
    readonly entryTargetFilePath: string;
    readonly expectedApiResult: string;
    readonly contentAssertions: readonly DeadCodeEliminationTextAssertion[];
    readonly fixtureSha256: string;
    readonly assertionSha256: string;
};

export type DeadCodeEliminationArtifactBundleContentCase = {
    readonly type: 'artifact-bundle-content';
    readonly id: string;
    readonly fixture: string;
    readonly bundleName: string;
    readonly entryTargetFilePath: string;
    readonly resources: readonly DeadCodeEliminationArtifactResource[];
    readonly contentAssertions: readonly DeadCodeEliminationContentAssertion[];
    readonly fixtureSha256: string;
    readonly assertionSha256: string;
};

type DeadCodeEliminationRegressionCaseByType = {
    readonly artifactBundleContent: DeadCodeEliminationArtifactBundleContentCase;
    readonly consumerProducerApi: DeadCodeEliminationConsumerProducerApiCase;
};

export type DeadCodeEliminationRegressionCase =
    DeadCodeEliminationRegressionCaseByType[keyof DeadCodeEliminationRegressionCaseByType];

type ConsumerProducerApiAssertionPayload = Pick<
    DeadCodeEliminationConsumerProducerApiCase,
    'contentAssertions' | 'entryPackage' | 'entryTargetFilePath' | 'expectedApiResult' | 'fixture' | 'id' | 'type'
>;

type ArtifactBundleContentAssertionPayload = Pick<
    DeadCodeEliminationArtifactBundleContentCase,
    'bundleName' | 'contentAssertions' | 'entryTargetFilePath' | 'fixture' | 'id' | 'resources' | 'type'
>;

type RegressionCaseAssertionPayload = ArtifactBundleContentAssertionPayload | ConsumerProducerApiAssertionPayload;

type DirectoryEntry = Awaited<ReturnType<FileManager['listDirectoryEntries']>>[number];

const fileManager = createFileManager({ hostFileSystem: fs.promises });

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKnownKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[], context: string): void {
    const allowedKeys = new Set(keys);
    for (const key of Object.keys(record)) {
        if (!allowedKeys.has(key)) {
            throw new TypeError(`${context}: unexpected property "${key}"`);
        }
    }
}

function readString(record: Readonly<Record<string, unknown>>, key: string, context: string): string {
    const value = record[key];
    if (typeof value !== 'string') {
        throw new TypeError(`${context}: "${key}" must be a string`);
    }
    return value;
}

function readStringArray(record: Readonly<Record<string, unknown>>, key: string, context: string): readonly string[] {
    const value = record[key];
    if (!Array.isArray(value)) {
        throw new TypeError(`${context}: "${key}" must be an array of strings`);
    }
    return value.map(function (entry) {
        if (typeof entry !== 'string') {
            throw new TypeError(`${context}: "${key}" must be an array of strings`);
        }
        return entry;
    });
}

function textAssertionFor(
    type: string,
    targetFilePath: string,
    text: string,
    context: string
): DeadCodeEliminationTextAssertion {
    if (type === 'contains-text') {
        return { type, targetFilePath, text };
    }
    if (type === 'omits-text') {
        return { type, targetFilePath, text };
    }

    throw new TypeError(`${context}: "type" must be "contains-text" or "omits-text"`);
}

function readContentAssertion(value: unknown, context: string): DeadCodeEliminationContentAssertion {
    if (!isRecord(value)) {
        throw new TypeError(`${context}: content assertion must be an object`);
    }
    const type = readString(value, 'type', context);
    if (type === 'source-map-sources') {
        assertKnownKeys(value, [ 'type', 'targetFilePath', 'sources' ], context);
        return {
            type,
            targetFilePath: readString(value, 'targetFilePath', context),
            sources: readStringArray(value, 'sources', context)
        };
    }

    assertKnownKeys(value, [ 'type', 'targetFilePath', 'text' ], context);
    return textAssertionFor(
        type,
        readString(value, 'targetFilePath', context),
        readString(value, 'text', context),
        context
    );
}

function readContentAssertionArray(
    record: Readonly<Record<string, unknown>>,
    context: string
): readonly DeadCodeEliminationContentAssertion[] {
    const value = record.contentAssertions;
    if (!Array.isArray(value)) {
        throw new TypeError(`${context}: "contentAssertions" must be an array`);
    }
    return value.map(function (entry, index) {
        return readContentAssertion(entry, `${context}.contentAssertions[${index}]`);
    });
}

function readTextAssertionArray(
    record: Readonly<Record<string, unknown>>,
    context: string
): readonly DeadCodeEliminationTextAssertion[] {
    return readContentAssertionArray(record, context).map(function (entry, index) {
        if (entry.type === 'source-map-sources') {
            throw new TypeError(`${context}.contentAssertions[${index}]: source map assertions require artifact cases`);
        }
        return entry;
    });
}

function readArtifactResource(value: unknown, context: string): DeadCodeEliminationArtifactResource {
    if (!isRecord(value)) {
        throw new TypeError(`${context}: artifact resource must be an object`);
    }
    assertKnownKeys(value, [ 'fixtureFilePath', 'inputFilePath', 'targetFilePath' ], context);
    return {
        fixtureFilePath: readString(value, 'fixtureFilePath', context),
        inputFilePath: readString(value, 'inputFilePath', context),
        targetFilePath: readString(value, 'targetFilePath', context)
    };
}

function readArtifactResources(
    record: Readonly<Record<string, unknown>>,
    context: string
): readonly DeadCodeEliminationArtifactResource[] {
    const value = record.resources;
    if (!Array.isArray(value)) {
        throw new TypeError(`${context}: "resources" must be an array`);
    }
    return value.map(function (entry, index) {
        return readArtifactResource(entry, `${context}.resources[${index}]`);
    });
}

function readConsumerProducerApiCase(
    record: Readonly<Record<string, unknown>>,
    context: string
): DeadCodeEliminationConsumerProducerApiCase {
    assertKnownKeys(record, [
        'type',
        'id',
        'fixture',
        'entryPackage',
        'entryTargetFilePath',
        'expectedApiResult',
        'contentAssertions',
        'fixtureSha256',
        'assertionSha256'
    ], context);

    return {
        type: 'consumer-producer-api',
        id: readString(record, 'id', context),
        fixture: readString(record, 'fixture', context),
        entryPackage: readString(record, 'entryPackage', context),
        entryTargetFilePath: readString(record, 'entryTargetFilePath', context),
        expectedApiResult: readString(record, 'expectedApiResult', context),
        contentAssertions: readTextAssertionArray(record, context),
        fixtureSha256: readString(record, 'fixtureSha256', context),
        assertionSha256: readString(record, 'assertionSha256', context)
    };
}

function readArtifactBundleContentCase(
    record: Readonly<Record<string, unknown>>,
    context: string
): DeadCodeEliminationArtifactBundleContentCase {
    assertKnownKeys(record, [
        'type',
        'id',
        'fixture',
        'bundleName',
        'entryTargetFilePath',
        'resources',
        'contentAssertions',
        'fixtureSha256',
        'assertionSha256'
    ], context);

    return {
        type: 'artifact-bundle-content',
        id: readString(record, 'id', context),
        fixture: readString(record, 'fixture', context),
        bundleName: readString(record, 'bundleName', context),
        entryTargetFilePath: readString(record, 'entryTargetFilePath', context),
        resources: readArtifactResources(record, context),
        contentAssertions: readContentAssertionArray(record, context),
        fixtureSha256: readString(record, 'fixtureSha256', context),
        assertionSha256: readString(record, 'assertionSha256', context)
    };
}

function readRegressionCase(value: unknown, index: number): DeadCodeEliminationRegressionCase {
    const context = `regression case ${index}`;
    if (!isRecord(value)) {
        throw new TypeError(`${context}: case must be an object`);
    }

    const type = readString(value, 'type', context);
    if (type === 'consumer-producer-api') {
        return readConsumerProducerApiCase(value, context);
    }
    if (type === 'artifact-bundle-content') {
        return readArtifactBundleContentCase(value, context);
    }

    throw new TypeError(`${context}: "type" must be "artifact-bundle-content" or "consumer-producer-api"`);
}

function parseRegressionCases(content: string): readonly DeadCodeEliminationRegressionCase[] {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
        throw new TypeError('dead code elimination regression manifest must be an array');
    }
    return parsed.map(readRegressionCase);
}

function fixturePathFor(fixtureRootPath: string, regressionCase: DeadCodeEliminationRegressionCase): string {
    return path.join(fixtureRootPath, regressionCase.fixture);
}

function relativeFixturePath(basePath: string, filePath: string): string {
    return path.relative(basePath, filePath).split(path.sep).join(path.posix.sep);
}

async function collectFilePaths(absoluteDirectoryPath: string): Promise<readonly string[]> {
    const entries = await fileManager.listDirectoryEntries(absoluteDirectoryPath);
    const nestedFiles = await Promise.all(
        entries.map(async function (entry: DirectoryEntry): Promise<readonly string[]> {
            const entryPath = path.join(absoluteDirectoryPath, entry.name);
            return entry.isDirectory ? collectFilePaths(entryPath) : [ entryPath ];
        })
    );
    return nestedFiles.flat().toSorted(function (left, right) {
        return left.localeCompare(right);
    });
}

function assertionPayload(regressionCase: DeadCodeEliminationRegressionCase): RegressionCaseAssertionPayload {
    if (regressionCase.type === 'artifact-bundle-content') {
        return {
            type: regressionCase.type,
            id: regressionCase.id,
            fixture: regressionCase.fixture,
            bundleName: regressionCase.bundleName,
            entryTargetFilePath: regressionCase.entryTargetFilePath,
            resources: regressionCase.resources,
            contentAssertions: regressionCase.contentAssertions
        };
    }

    return {
        type: regressionCase.type,
        id: regressionCase.id,
        fixture: regressionCase.fixture,
        entryPackage: regressionCase.entryPackage,
        entryTargetFilePath: regressionCase.entryTargetFilePath,
        expectedApiResult: regressionCase.expectedApiResult,
        contentAssertions: regressionCase.contentAssertions
    };
}

export async function readDeadCodeEliminationRegressionCases(
    manifestFilePath: string
): Promise<readonly DeadCodeEliminationRegressionCase[]> {
    return parseRegressionCases(await fileManager.readFile(manifestFilePath));
}

export async function deadCodeEliminationFixtureSha256(
    regressionCase: DeadCodeEliminationRegressionCase,
    fixtureRootPath: string
): Promise<string> {
    const fixturePath = fixturePathFor(fixtureRootPath, regressionCase);
    const filePaths = await collectFilePaths(fixturePath);
    const hash = createHash('sha256');

    for (const filePath of filePaths) {
        hash.update(relativeFixturePath(fixturePath, filePath));
        hash.update('\0');
        hash.update(await fileManager.readFileBytes(filePath));
        hash.update('\0');
    }

    return hash.digest('hex');
}

export async function deadCodeEliminationFixtureFilePaths(
    regressionCase: DeadCodeEliminationRegressionCase,
    fixtureRootPath: string
): Promise<readonly string[]> {
    const fixturePath = fixturePathFor(fixtureRootPath, regressionCase);
    const filePaths = await collectFilePaths(fixturePath);
    return filePaths.map(function (filePath) {
        return relativeFixturePath(fixturePath, filePath);
    });
}

async function artifactResource(
    regressionCase: DeadCodeEliminationArtifactBundleContentCase,
    fixtureRootPath: string,
    resource: DeadCodeEliminationArtifactResource
): Promise<LinkedBundleResource> {
    const fixturePath = fixturePathFor(fixtureRootPath, regressionCase);
    const content = await fileManager.readFile(path.join(fixturePath, resource.fixtureFilePath));
    return {
        ...bundleResource(resource.inputFilePath, {
            content,
            targetFilePath: resource.targetFilePath
        }),
        isSubstituted: false
    };
}

async function deadCodeEliminationArtifactBundle(
    regressionCase: DeadCodeEliminationArtifactBundleContentCase,
    fixtureRootPath: string
): Promise<LinkedBundle> {
    const contents = await Promise.all(
        regressionCase.resources.map(async function (resource) {
            return artifactResource(regressionCase, fixtureRootPath, resource);
        })
    );
    const entry = contents.find(function (resource) {
        return resource.fileDescription.targetFilePath === regressionCase.entryTargetFilePath;
    });
    if (entry === undefined) {
        throw new Error(`${regressionCase.id}: artifact resources must include the entry target file`);
    }

    return linkedBundle({
        name: regressionCase.bundleName,
        contents,
        roots: {
            main: {
                js: {
                    content: entry.fileDescription.content,
                    isExecutable: false,
                    inputFilePath: entry.fileDescription.inputFilePath,
                    targetFilePath: entry.fileDescription.targetFilePath
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

export async function eliminateDeadCodeEliminationArtifactBundle(
    regressionCase: DeadCodeEliminationArtifactBundleContentCase,
    fixtureRootPath: string
): Promise<AnalyzedBundle> {
    const [ analyzedBundle ] = await createTestEliminator().eliminate(
        inputs(await deadCodeEliminationArtifactBundle(regressionCase, fixtureRootPath))
    );
    if (analyzedBundle === undefined) {
        throw new Error(`${regressionCase.id}: expected dead code elimination output`);
    }

    return analyzedBundle;
}

export function deadCodeEliminationAssertionSha256(regressionCase: DeadCodeEliminationRegressionCase): string {
    const serializedPayload = serializeStableJson(assertionPayload(regressionCase), {
        shouldPreserveArrayOrder() {
            return true;
        }
    });

    return createHash('sha256').update(serializedPayload).digest('hex');
}
