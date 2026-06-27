import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { extract, type Headers as TarEntryHeaders } from 'tar-stream';

export type TarEntry = {
    readonly header: TarEntryHeaders;
    readonly content: string;
};

type ExtractTarDependencies = {
    readonly createSource: (buffer: Buffer) => Readable;
};

type ExtractTarLimits = {
    readonly maxEntryCount: number;
    readonly maxEntryPathLength: number;
    readonly maxExtractedBytes: number;
};

type EntryContent = {
    readonly content: string;
    readonly extractedBytes: number;
};

type ExtractionStreams = {
    readonly extractStream: ErrorEmitter;
    readonly gunzip: ErrorEmitter;
    readonly source: ErrorEmitter;
    readonly tarEntries: AsyncIterable<TarStreamEntry>;
};

const defaultExtractTarLimits: ExtractTarLimits = {
    maxEntryCount: 50_000,
    maxEntryPathLength: 4096,
    maxExtractedBytes: 1_073_741_824
};

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

type TarStreamEntry = AsyncIterable<Buffer> & {
    readonly header: TarEntryHeaders;
};

type ErrorEmitter = {
    readonly once: (eventName: 'error', listener: (error: unknown) => void) => unknown;
};

function assertWithinEntryCountLimit(entries: readonly TarEntry[], limits: ExtractTarLimits): void {
    if (entries.length >= limits.maxEntryCount) {
        throw new Error(`Refusing to extract tarball with more than ${limits.maxEntryCount} entries`);
    }
}

function assertWithinEntryPathLimit(entry: TarStreamEntry, limits: ExtractTarLimits): void {
    if (entry.header.name.length > limits.maxEntryPathLength) {
        throw new Error(
            `Refusing to extract tarball entry with path longer than ${limits.maxEntryPathLength} characters`
        );
    }
}

function assertWithinExtractedSizeLimit(extractedBytes: number, limits: ExtractTarLimits): void {
    if (extractedBytes > limits.maxExtractedBytes) {
        throw new Error(`Refusing to extract tarball larger than ${limits.maxExtractedBytes} bytes`);
    }
}

async function readEntryContent(
    entry: TarStreamEntry,
    currentExtractedBytes: number,
    limits: ExtractTarLimits
): Promise<EntryContent> {
    let result = '';
    let extractedBytes = currentExtractedBytes;

    for await (const chunk of entry) {
        extractedBytes += chunk.length;
        assertWithinExtractedSizeLimit(extractedBytes, limits);
        result += chunk.toString();
    }

    return { content: result, extractedBytes };
}

async function collectTarEntries(stream: AsyncIterable<TarStreamEntry>, limits: ExtractTarLimits): Promise<TarEntry[]> {
    const entries: TarEntry[] = [];
    let extractedBytes = 0;

    for await (const entry of stream) {
        assertWithinEntryCountLimit(entries, limits);
        assertWithinEntryPathLimit(entry, limits);
        const content = await readEntryContent(entry, extractedBytes, limits);
        extractedBytes = content.extractedBytes;
        entries.push({ header: entry.header, content: content.content });
    }

    return entries;
}

async function waitForStreamError(stream: ErrorEmitter): Promise<never> {
    return await new Promise<never>((_resolve, reject) => {
        stream.once('error', (error: unknown) => {
            reject(toError(error));
        });
    });
}

function appendOutcome(outcomes: Set<Promise<TarEntry[]>>, outcome: Promise<TarEntry[]>): Set<Promise<TarEntry[]>> {
    outcomes.add(outcome);
    return outcomes;
}

async function raceExtractionOutcomes(streams: ExtractionStreams, limits: ExtractTarLimits): Promise<TarEntry[]> {
    return await Promise.race(
        appendOutcome(
            appendOutcome(
                appendOutcome(
                    appendOutcome(new Set<Promise<TarEntry[]>>(), collectTarEntries(streams.tarEntries, limits)),
                    waitForStreamError(streams.source)
                ),
                waitForStreamError(streams.gunzip)
            ),
            waitForStreamError(streams.extractStream)
        )
    );
}

export async function extractTarEntries(
    buffer: Buffer,
    dependencies: Partial<ExtractTarDependencies> = {},
    limits: ExtractTarLimits = defaultExtractTarLimits
): Promise<TarEntry[]> {
    const createSource = dependencies.createSource ?? Readable.from;
    const extractStream = extract();
    const source = createSource(buffer);
    const gunzip = createGunzip();
    const tarEntries = source.pipe(gunzip).pipe(extractStream) as AsyncIterable<TarStreamEntry>;

    try {
        return await raceExtractionOutcomes({ extractStream, gunzip, source, tarEntries }, limits);
    } catch (error: unknown) {
        throw toError(error);
    }
}
