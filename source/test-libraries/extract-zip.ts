import { unzip, type FlateError, type Unzipped } from 'fflate';

export type ZipEntry = {
    readonly name: string;
    readonly content: string;
    readonly unixMode: number;
    readonly osOfOrigin: number;
};

type CentralDirectoryEntry = {
    readonly name: string;
    readonly osOfOrigin: number;
    readonly unixMode: number;
    readonly nextOffset: number;
};

const endOfCentralDirectorySignature = 101_010_256;
const centralDirectoryEntrySignature = 33_639_248;
const endOfCentralDirectoryLength = 22;
const centralDirectoryEntryHeaderLength = 46;
const totalEntriesOffset = 10;
const centralDirectoryStartOffset = 16;
const versionMadeByHighByteOffset = 5;
const fileNameLengthOffset = 28;
const extraFieldLengthOffset = 30;
const fileCommentLengthOffset = 32;
const externalAttributesOffset = 38;
const highBytesScale = 65_536;

function findEndOfCentralDirectory(buffer: Buffer): number {
    for (let offset = buffer.length - endOfCentralDirectoryLength; offset >= 0; offset -= 1) {
        if (buffer.readUInt32LE(offset) === endOfCentralDirectorySignature) {
            return offset;
        }
    }
    throw new Error('end of central directory record not found in zip buffer');
}

function readCentralDirectoryEntry(buffer: Buffer, offset: number): CentralDirectoryEntry {
    if (buffer.readUInt32LE(offset) !== centralDirectoryEntrySignature) {
        throw new Error(`invalid central directory entry signature at offset ${offset}`);
    }
    const osOfOrigin = buffer.readUInt8(offset + versionMadeByHighByteOffset);
    const fileNameLength = buffer.readUInt16LE(offset + fileNameLengthOffset);
    const extraFieldLength = buffer.readUInt16LE(offset + extraFieldLengthOffset);
    const fileCommentLength = buffer.readUInt16LE(offset + fileCommentLengthOffset);
    const externalFileAttributes = buffer.readUInt32LE(offset + externalAttributesOffset);
    const nameStart = offset + centralDirectoryEntryHeaderLength;
    const name = buffer.toString('utf8', nameStart, nameStart + fileNameLength);
    return {
        name,
        osOfOrigin,
        unixMode: Math.floor(externalFileAttributes / highBytesScale),
        nextOffset: nameStart + fileNameLength + extraFieldLength + fileCommentLength
    };
}

function readCentralDirectoryMetadata(buffer: Buffer): Map<string, CentralDirectoryEntry> {
    const endOfCentralDirectoryOffset = findEndOfCentralDirectory(buffer);
    const numberOfEntries = buffer.readUInt16LE(endOfCentralDirectoryOffset + totalEntriesOffset);
    const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectoryOffset + centralDirectoryStartOffset);

    const metadataByName = new Map<string, CentralDirectoryEntry>();
    let offset = centralDirectoryOffset;
    for (let index = 0; index < numberOfEntries; index += 1) {
        const entry = readCentralDirectoryEntry(buffer, offset);
        metadataByName.set(entry.name, entry);
        offset = entry.nextOffset;
    }
    return metadataByName;
}

async function decodeZipContents(buffer: Buffer): Promise<Unzipped> {
    return await new Promise<Unzipped>((resolve, reject) => {
        const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        unzip(data, (error: FlateError | null, decoded: Unzipped) => {
            if (error === null) {
                resolve(decoded);
                return;
            }
            reject(error);
        });
    });
}

export async function extractZipEntries(buffer: Buffer): Promise<readonly ZipEntry[]> {
    const decoded = await decodeZipContents(buffer);
    const metadataByName = readCentralDirectoryMetadata(buffer);
    return Object.entries(decoded).map(([name, data]) => {
        const metadata = metadataByName.get(name);
        if (metadata === undefined) {
            throw new Error(`zip entry "${name}" is missing from the central directory`);
        }
        return {
            name,
            content: new TextDecoder().decode(data),
            unixMode: metadata.unixMode,
            osOfOrigin: metadata.osOfOrigin
        };
    });
}
