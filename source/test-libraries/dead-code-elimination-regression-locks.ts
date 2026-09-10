import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { serializeStableJson } from '../common/stable-json.ts';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';

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

export type DeadCodeEliminationTextAssertion = ContainsTextAssertion | OmitsTextAssertion;

export type DeadCodeEliminationRegressionCase = {
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

type RegressionCaseAssertionPayload = {
    readonly type: DeadCodeEliminationRegressionCase['type'];
    readonly id: DeadCodeEliminationRegressionCase['id'];
    readonly fixture: DeadCodeEliminationRegressionCase['fixture'];
    readonly entryPackage: DeadCodeEliminationRegressionCase['entryPackage'];
    readonly entryTargetFilePath: DeadCodeEliminationRegressionCase['entryTargetFilePath'];
    readonly expectedApiResult: DeadCodeEliminationRegressionCase['expectedApiResult'];
    readonly contentAssertions: DeadCodeEliminationRegressionCase['contentAssertions'];
};

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

function readTextAssertion(value: unknown, context: string): DeadCodeEliminationTextAssertion {
    if (!isRecord(value)) {
        throw new TypeError(`${context}: text assertion must be an object`);
    }
    assertKnownKeys(value, [ 'type', 'targetFilePath', 'text' ], context);
    return textAssertionFor(
        readString(value, 'type', context),
        readString(value, 'targetFilePath', context),
        readString(value, 'text', context),
        context
    );
}

function readContentAssertions(
    record: Readonly<Record<string, unknown>>,
    context: string
): readonly DeadCodeEliminationTextAssertion[] {
    const value = record.contentAssertions;
    if (!Array.isArray(value)) {
        throw new TypeError(`${context}: "contentAssertions" must be an array`);
    }
    return value.map(function (entry, index) {
        return readTextAssertion(entry, `${context}.contentAssertions[${index}]`);
    });
}

function readRegressionCase(value: unknown, index: number): DeadCodeEliminationRegressionCase {
    const context = `regression case ${index}`;
    if (!isRecord(value)) {
        throw new TypeError(`${context}: case must be an object`);
    }
    assertKnownKeys(value, [
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

    const type = readString(value, 'type', context);
    if (type !== 'consumer-producer-api') {
        throw new TypeError(`${context}: "type" must be "consumer-producer-api"`);
    }

    return {
        type,
        id: readString(value, 'id', context),
        fixture: readString(value, 'fixture', context),
        entryPackage: readString(value, 'entryPackage', context),
        entryTargetFilePath: readString(value, 'entryTargetFilePath', context),
        expectedApiResult: readString(value, 'expectedApiResult', context),
        contentAssertions: readContentAssertions(value, context),
        fixtureSha256: readString(value, 'fixtureSha256', context),
        assertionSha256: readString(value, 'assertionSha256', context)
    };
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

export function deadCodeEliminationAssertionSha256(regressionCase: DeadCodeEliminationRegressionCase): string {
    const serializedPayload = serializeStableJson(assertionPayload(regressionCase), {
        shouldPreserveArrayOrder() {
            return true;
        }
    });

    return createHash('sha256').update(serializedPayload).digest('hex');
}
