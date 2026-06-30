import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';

type DirectoryEntry = Awaited<ReturnType<FileManager['listDirectoryEntries']>>[number];

type SimulatedSuccess<TValue> = {
    readonly value: TValue;
    readonly error?: undefined;
};

type SimulatedError = {
    readonly error: Error;
};

type SimulatedResponse<TValue> = SimulatedError | SimulatedSuccess<TValue>;

type SimulatedVoidResponse = SimulatedError | { readonly error?: undefined; };

type ReadabilityResult = {
    readonly isReadable: boolean;
};

type ReadFileCall = {
    readonly filePath: string;
};

type ReadFileBytesCall = {
    readonly filePath: string;
};

type WriteFileCall = {
    readonly filePath: string;
    readonly content: string;
};

type WriteBinaryFileCall = {
    readonly filePath: string;
    readonly content: Buffer;
};

type CopyFileCall = {
    readonly from: string;
    readonly to: string;
};

type CopyFileBytesCall = {
    readonly from: string;
    readonly to: string;
};

type ListDirectoryCall = {
    readonly directoryPath: string;
};

type RealPathCall = {
    readonly filePath: string;
};

type CheckReadabilityCall = {
    readonly fileOrFolderPath: string;
};

type TransferableFileDescriptionCall = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
};

type TransferableFileDescriptionResponder = (
    sourceFilePath: string,
    targetFilePath: string
) => SimulatedResponse<TransferableFileDescription>;

type FakeFileManagerOptions = {
    readonly simulatedReadFileResponses?: readonly SimulatedResponse<string>[];
    readonly simulatedReadFileBytesResponses?: readonly SimulatedResponse<Buffer>[];
    readonly simulatedCheckReadabilityResponses?: readonly SimulatedResponse<ReadabilityResult>[];
    readonly simulatedTransferableFileDescriptionResponses?: readonly SimulatedResponse<TransferableFileDescription>[];
    readonly transferableFileDescriptionResponder?: TransferableFileDescriptionResponder;
    readonly simulatedWriteFileResponses?: readonly SimulatedVoidResponse[];
    readonly simulatedWriteBinaryFileResponses?: readonly SimulatedVoidResponse[];
    readonly simulatedCopyFileResponses?: readonly SimulatedVoidResponse[];
    readonly simulatedCopyFileBytesResponses?: readonly SimulatedVoidResponse[];
    readonly simulatedListDirectoryResponses?: readonly SimulatedResponse<readonly DirectoryEntry[]>[];
    readonly simulatedRealPathResponses?: readonly SimulatedResponse<string>[];
};

type ResolvedFakeFileManagerOptions = {
    readonly simulatedReadFileResponses: readonly SimulatedResponse<string>[];
    readonly simulatedReadFileBytesResponses: readonly SimulatedResponse<Buffer>[];
    readonly simulatedCheckReadabilityResponses: readonly SimulatedResponse<ReadabilityResult>[];
    readonly simulatedTransferableFileDescriptionResponses: readonly SimulatedResponse<TransferableFileDescription>[];
    readonly transferableFileDescriptionResponder: TransferableFileDescriptionResponder | undefined;
    readonly simulatedWriteFileResponses: readonly SimulatedVoidResponse[];
    readonly simulatedWriteBinaryFileResponses: readonly SimulatedVoidResponse[];
    readonly simulatedCopyFileResponses: readonly SimulatedVoidResponse[];
    readonly simulatedCopyFileBytesResponses: readonly SimulatedVoidResponse[];
    readonly simulatedListDirectoryResponses: readonly SimulatedResponse<readonly DirectoryEntry[]>[];
    readonly simulatedRealPathResponses: readonly SimulatedResponse<string>[];
};

type CallList<TCall> = readonly TCall[] & {
    readonly push: (call: TCall) => unknown;
};

type FileManagerCallLog = {
    readonly readFile: CallList<ReadFileCall>;
    readonly readFileBytes: CallList<ReadFileBytesCall>;
    readonly writeFile: CallList<WriteFileCall>;
    readonly writeBinaryFile: CallList<WriteBinaryFileCall>;
    readonly copyFile: CallList<CopyFileCall>;
    readonly copyFileBytes: CallList<CopyFileBytesCall>;
    readonly listDirectory: CallList<ListDirectoryCall>;
    readonly realPath: CallList<RealPathCall>;
    readonly checkReadability: CallList<CheckReadabilityCall>;
    readonly transferableFileDescription: CallList<TransferableFileDescriptionCall>;
};

export type FakeFileManager = FileManager & {
    readonly getReadFileCallCount: () => number;
    readonly getReadFileCall: (index: number) => ReadFileCall;
    readonly getAllReadFileCalls: () => readonly ReadFileCall[];

    readonly getReadFileBytesCallCount: () => number;
    readonly getReadFileBytesCall: (index: number) => ReadFileBytesCall;
    readonly getAllReadFileBytesCalls: () => readonly ReadFileBytesCall[];

    readonly getWriteFileCallCount: () => number;
    readonly getWriteFileCall: (index: number) => WriteFileCall;
    readonly getAllWriteFileCalls: () => readonly WriteFileCall[];

    readonly getWriteBinaryFileCallCount: () => number;
    readonly getWriteBinaryFileCall: (index: number) => WriteBinaryFileCall;
    readonly getAllWriteBinaryFileCalls: () => readonly WriteBinaryFileCall[];

    readonly getCopyFileCallCount: () => number;
    readonly getCopyFileCall: (index: number) => CopyFileCall;
    readonly getAllCopyFileCalls: () => readonly CopyFileCall[];

    readonly getCopyFileBytesCallCount: () => number;
    readonly getCopyFileBytesCall: (index: number) => CopyFileBytesCall;
    readonly getAllCopyFileBytesCalls: () => readonly CopyFileBytesCall[];

    readonly getListDirectoryCallCount: () => number;
    readonly getListDirectoryCall: (index: number) => ListDirectoryCall;
    readonly getAllListDirectoryCalls: () => readonly ListDirectoryCall[];

    readonly getRealPathCallCount: () => number;
    readonly getRealPathCall: (index: number) => RealPathCall;
    readonly getAllRealPathCalls: () => readonly RealPathCall[];

    readonly getCheckReadabilityCallCount: () => number;
    readonly getCheckReadabilityCall: (index: number) => CheckReadabilityCall;
    readonly getAllCheckReadabilityCalls: () => readonly CheckReadabilityCall[];

    readonly getTransferableFileDescriptionCallCount: () => number;
    readonly getTransferableFileDescriptionCall: (index: number) => TransferableFileDescriptionCall;
    readonly getAllTransferableFileDescriptionCalls: () => readonly TransferableFileDescriptionCall[];
};

const defaultReadFileResponse: SimulatedResponse<string> = { value: '' };
const defaultReadFileBytesResponse: SimulatedResponse<Buffer> = { value: Buffer.alloc(0) };
const defaultCheckReadabilityResponse: SimulatedResponse<ReadabilityResult> = { value: { isReadable: true } };
const defaultVoidResponse: SimulatedVoidResponse = {};
const defaultFakeFileManagerOptions: ResolvedFakeFileManagerOptions = {
    simulatedReadFileResponses: [],
    simulatedReadFileBytesResponses: [],
    simulatedCheckReadabilityResponses: [],
    simulatedTransferableFileDescriptionResponses: [],
    transferableFileDescriptionResponder: undefined,
    simulatedWriteFileResponses: [],
    simulatedWriteBinaryFileResponses: [],
    simulatedCopyFileResponses: [],
    simulatedCopyFileBytesResponses: [],
    simulatedListDirectoryResponses: [],
    simulatedRealPathResponses: []
};

function resolveValueResponse<TValue>(response: SimulatedResponse<TValue>): TValue {
    if (response.error !== undefined) {
        throw response.error;
    }
    return response.value;
}

function resolveVoidResponse(response: SimulatedVoidResponse): void {
    if (response.error !== undefined) {
        throw response.error;
    }
}

function getCallAtIndex<TCall>(calls: readonly TCall[], methodName: string, index: number): TCall {
    const call = calls[index];

    if (call === undefined) {
        throw new TypeError(`No ${methodName} call collected at index ${index}`);
    }

    return call;
}

function resolveFakeFileManagerOptions(options: FakeFileManagerOptions): ResolvedFakeFileManagerOptions {
    return {
        ...defaultFakeFileManagerOptions,
        ...options
    };
}

function createFileManagerCallLog(): FileManagerCallLog {
    return {
        readFile: [] as ReadFileCall[],
        readFileBytes: [] as ReadFileBytesCall[],
        writeFile: [] as WriteFileCall[],
        writeBinaryFile: [] as WriteBinaryFileCall[],
        copyFile: [] as CopyFileCall[],
        copyFileBytes: [] as CopyFileBytesCall[],
        listDirectory: [] as ListDirectoryCall[],
        realPath: [] as RealPathCall[],
        checkReadability: [] as CheckReadabilityCall[],
        transferableFileDescription: [] as TransferableFileDescriptionCall[]
    };
}

export function createFakeFileManager(options: FakeFileManagerOptions = {}): FakeFileManager {
    const resolvedOptions = resolveFakeFileManagerOptions(options);
    const calls = createFileManagerCallLog();

    return {
        async readFile(filePath) {
            const response = resolvedOptions.simulatedReadFileResponses[calls.readFile.length] ??
                defaultReadFileResponse;
            calls.readFile.push({ filePath });
            return resolveValueResponse(response);
        },

        async readFileBytes(filePath) {
            const response = resolvedOptions.simulatedReadFileBytesResponses[calls.readFileBytes.length] ??
                defaultReadFileBytesResponse;
            calls.readFileBytes.push({ filePath });
            return resolveValueResponse(response);
        },

        async writeFile(filePath, content) {
            const response = resolvedOptions.simulatedWriteFileResponses[calls.writeFile.length] ?? defaultVoidResponse;
            calls.writeFile.push({ filePath, content });
            resolveVoidResponse(response);
        },

        async writeBinaryFile(filePath, content) {
            const response = resolvedOptions.simulatedWriteBinaryFileResponses[calls.writeBinaryFile.length] ??
                defaultVoidResponse;
            calls.writeBinaryFile.push({ filePath, content });
            resolveVoidResponse(response);
        },

        async setExecutable() {
            return undefined;
        },

        async copyFile(from, to) {
            const response = resolvedOptions.simulatedCopyFileResponses[calls.copyFile.length] ?? defaultVoidResponse;
            calls.copyFile.push({ from, to });
            resolveVoidResponse(response);
        },

        async copyFileBytes(from, to) {
            const response = resolvedOptions.simulatedCopyFileBytesResponses[calls.copyFileBytes.length] ??
                defaultVoidResponse;
            calls.copyFileBytes.push({ from, to });
            resolveVoidResponse(response);
        },

        async listDirectoryEntries(directoryPath) {
            const response = resolvedOptions.simulatedListDirectoryResponses[calls.listDirectory.length] ??
                { value: [] };
            calls.listDirectory.push({ directoryPath });
            return resolveValueResponse(response);
        },

        async getRealPath(filePath) {
            const response = resolvedOptions.simulatedRealPathResponses[calls.realPath.length] ?? { value: filePath };
            calls.realPath.push({ filePath });
            return resolveValueResponse(response);
        },

        async checkReadability(fileOrFolderPath) {
            const response = resolvedOptions.simulatedCheckReadabilityResponses[calls.checkReadability.length] ??
                defaultCheckReadabilityResponse;
            calls.checkReadability.push({ fileOrFolderPath });
            return resolveValueResponse(response);
        },

        async getTransferableFileDescriptionFromPath(sourceFilePath, targetFilePath) {
            const fallbackResponse: SimulatedResponse<TransferableFileDescription> = {
                value: { sourceFilePath, targetFilePath, content: '', isExecutable: false }
            };
            const responderResponse = resolvedOptions.transferableFileDescriptionResponder?.(
                sourceFilePath,
                targetFilePath
            );
            const response = responderResponse ??
                resolvedOptions.simulatedTransferableFileDescriptionResponses[
                    calls.transferableFileDescription.length
                ] ??
                fallbackResponse;
            calls.transferableFileDescription.push({ sourceFilePath, targetFilePath });
            return resolveValueResponse(response);
        },

        getReadFileCallCount() {
            return calls.readFile.length;
        },
        getReadFileCall(index) {
            return getCallAtIndex(calls.readFile, 'readFile', index);
        },
        getAllReadFileCalls() {
            return calls.readFile;
        },

        getReadFileBytesCallCount() {
            return calls.readFileBytes.length;
        },
        getReadFileBytesCall(index) {
            return getCallAtIndex(calls.readFileBytes, 'readFileBytes', index);
        },
        getAllReadFileBytesCalls() {
            return calls.readFileBytes;
        },

        getWriteFileCallCount() {
            return calls.writeFile.length;
        },
        getWriteFileCall(index) {
            return getCallAtIndex(calls.writeFile, 'writeFile', index);
        },
        getAllWriteFileCalls() {
            return calls.writeFile;
        },

        getWriteBinaryFileCallCount() {
            return calls.writeBinaryFile.length;
        },
        getWriteBinaryFileCall(index) {
            return getCallAtIndex(calls.writeBinaryFile, 'writeBinaryFile', index);
        },
        getAllWriteBinaryFileCalls() {
            return calls.writeBinaryFile;
        },

        getCopyFileCallCount() {
            return calls.copyFile.length;
        },
        getCopyFileCall(index) {
            return getCallAtIndex(calls.copyFile, 'copyFile', index);
        },
        getAllCopyFileCalls() {
            return calls.copyFile;
        },

        getCopyFileBytesCallCount() {
            return calls.copyFileBytes.length;
        },
        getCopyFileBytesCall(index) {
            return getCallAtIndex(calls.copyFileBytes, 'copyFileBytes', index);
        },
        getAllCopyFileBytesCalls() {
            return calls.copyFileBytes;
        },

        getListDirectoryCallCount() {
            return calls.listDirectory.length;
        },
        getListDirectoryCall(index) {
            return getCallAtIndex(calls.listDirectory, 'listDirectoryEntries', index);
        },
        getAllListDirectoryCalls() {
            return calls.listDirectory;
        },

        getRealPathCallCount() {
            return calls.realPath.length;
        },
        getRealPathCall(index) {
            return getCallAtIndex(calls.realPath, 'getRealPath', index);
        },
        getAllRealPathCalls() {
            return calls.realPath;
        },

        getCheckReadabilityCallCount() {
            return calls.checkReadability.length;
        },
        getCheckReadabilityCall(index) {
            return getCallAtIndex(calls.checkReadability, 'checkReadability', index);
        },
        getAllCheckReadabilityCalls() {
            return calls.checkReadability;
        },

        getTransferableFileDescriptionCallCount() {
            return calls.transferableFileDescription.length;
        },
        getTransferableFileDescriptionCall(index) {
            return getCallAtIndex(
                calls.transferableFileDescription,
                'getTransferableFileDescriptionFromPath',
                index
            );
        },
        getAllTransferableFileDescriptionCalls() {
            return calls.transferableFileDescription;
        }
    };
}
