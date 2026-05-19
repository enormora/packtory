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

type SimulatedVoidResponse = SimulatedError | { readonly error?: undefined };

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

export function createFakeFileManager(options: FakeFileManagerOptions = {}): FakeFileManager {
    const {
        simulatedReadFileResponses = [],
        simulatedReadFileBytesResponses = [],
        simulatedCheckReadabilityResponses = [],
        simulatedTransferableFileDescriptionResponses = [],
        transferableFileDescriptionResponder,
        simulatedWriteFileResponses = [],
        simulatedWriteBinaryFileResponses = [],
        simulatedCopyFileResponses = [],
        simulatedCopyFileBytesResponses = [],
        simulatedListDirectoryResponses = [],
        simulatedRealPathResponses = []
    } = options;

    const readFileCalls: ReadFileCall[] = [];
    const readFileBytesCalls: ReadFileBytesCall[] = [];
    const writeFileCalls: WriteFileCall[] = [];
    const writeBinaryFileCalls: WriteBinaryFileCall[] = [];
    const copyFileCalls: CopyFileCall[] = [];
    const copyFileBytesCalls: CopyFileBytesCall[] = [];
    const listDirectoryCalls: ListDirectoryCall[] = [];
    const realPathCalls: RealPathCall[] = [];
    const checkReadabilityCalls: CheckReadabilityCall[] = [];
    const transferableFileDescriptionCalls: TransferableFileDescriptionCall[] = [];

    return {
        async readFile(filePath) {
            const response = simulatedReadFileResponses[readFileCalls.length] ?? defaultReadFileResponse;
            readFileCalls.push({ filePath });
            return resolveValueResponse(response);
        },

        async readFileBytes(filePath) {
            const response = simulatedReadFileBytesResponses[readFileBytesCalls.length] ?? defaultReadFileBytesResponse;
            readFileBytesCalls.push({ filePath });
            return resolveValueResponse(response);
        },

        async writeFile(filePath, content) {
            const response = simulatedWriteFileResponses[writeFileCalls.length] ?? defaultVoidResponse;
            writeFileCalls.push({ filePath, content });
            resolveVoidResponse(response);
        },

        async writeBinaryFile(filePath, content) {
            const response = simulatedWriteBinaryFileResponses[writeBinaryFileCalls.length] ?? defaultVoidResponse;
            writeBinaryFileCalls.push({ filePath, content });
            resolveVoidResponse(response);
        },

        async setExecutable() {
            return undefined;
        },

        async copyFile(from, to) {
            const response = simulatedCopyFileResponses[copyFileCalls.length] ?? defaultVoidResponse;
            copyFileCalls.push({ from, to });
            resolveVoidResponse(response);
        },

        async copyFileBytes(from, to) {
            const response = simulatedCopyFileBytesResponses[copyFileBytesCalls.length] ?? defaultVoidResponse;
            copyFileBytesCalls.push({ from, to });
            resolveVoidResponse(response);
        },

        async listDirectoryEntries(directoryPath) {
            const response = simulatedListDirectoryResponses[listDirectoryCalls.length] ?? { value: [] };
            listDirectoryCalls.push({ directoryPath });
            return resolveValueResponse(response);
        },

        async getRealPath(filePath) {
            const response = simulatedRealPathResponses[realPathCalls.length] ?? { value: filePath };
            realPathCalls.push({ filePath });
            return resolveValueResponse(response);
        },

        async checkReadability(fileOrFolderPath) {
            const response =
                simulatedCheckReadabilityResponses[checkReadabilityCalls.length] ?? defaultCheckReadabilityResponse;
            checkReadabilityCalls.push({ fileOrFolderPath });
            return resolveValueResponse(response);
        },

        async getTransferableFileDescriptionFromPath(sourceFilePath, targetFilePath) {
            const fallbackResponse: SimulatedResponse<TransferableFileDescription> = {
                value: { sourceFilePath, targetFilePath, content: '', isExecutable: false }
            };
            const responderResponse = transferableFileDescriptionResponder?.(sourceFilePath, targetFilePath);
            const response =
                responderResponse ??
                simulatedTransferableFileDescriptionResponses[transferableFileDescriptionCalls.length] ??
                fallbackResponse;
            transferableFileDescriptionCalls.push({ sourceFilePath, targetFilePath });
            return resolveValueResponse(response);
        },

        getReadFileCallCount() {
            return readFileCalls.length;
        },
        getReadFileCall(index) {
            return getCallAtIndex(readFileCalls, 'readFile', index);
        },
        getAllReadFileCalls() {
            return readFileCalls;
        },

        getReadFileBytesCallCount() {
            return readFileBytesCalls.length;
        },
        getReadFileBytesCall(index) {
            return getCallAtIndex(readFileBytesCalls, 'readFileBytes', index);
        },
        getAllReadFileBytesCalls() {
            return readFileBytesCalls;
        },

        getWriteFileCallCount() {
            return writeFileCalls.length;
        },
        getWriteFileCall(index) {
            return getCallAtIndex(writeFileCalls, 'writeFile', index);
        },
        getAllWriteFileCalls() {
            return writeFileCalls;
        },

        getWriteBinaryFileCallCount() {
            return writeBinaryFileCalls.length;
        },
        getWriteBinaryFileCall(index) {
            return getCallAtIndex(writeBinaryFileCalls, 'writeBinaryFile', index);
        },
        getAllWriteBinaryFileCalls() {
            return writeBinaryFileCalls;
        },

        getCopyFileCallCount() {
            return copyFileCalls.length;
        },
        getCopyFileCall(index) {
            return getCallAtIndex(copyFileCalls, 'copyFile', index);
        },
        getAllCopyFileCalls() {
            return copyFileCalls;
        },

        getCopyFileBytesCallCount() {
            return copyFileBytesCalls.length;
        },
        getCopyFileBytesCall(index) {
            return getCallAtIndex(copyFileBytesCalls, 'copyFileBytes', index);
        },
        getAllCopyFileBytesCalls() {
            return copyFileBytesCalls;
        },

        getListDirectoryCallCount() {
            return listDirectoryCalls.length;
        },
        getListDirectoryCall(index) {
            return getCallAtIndex(listDirectoryCalls, 'listDirectoryEntries', index);
        },
        getAllListDirectoryCalls() {
            return listDirectoryCalls;
        },

        getRealPathCallCount() {
            return realPathCalls.length;
        },
        getRealPathCall(index) {
            return getCallAtIndex(realPathCalls, 'getRealPath', index);
        },
        getAllRealPathCalls() {
            return realPathCalls;
        },

        getCheckReadabilityCallCount() {
            return checkReadabilityCalls.length;
        },
        getCheckReadabilityCall(index) {
            return getCallAtIndex(checkReadabilityCalls, 'checkReadability', index);
        },
        getAllCheckReadabilityCalls() {
            return checkReadabilityCalls;
        },

        getTransferableFileDescriptionCallCount() {
            return transferableFileDescriptionCalls.length;
        },
        getTransferableFileDescriptionCall(index) {
            return getCallAtIndex(transferableFileDescriptionCalls, 'getTransferableFileDescriptionFromPath', index);
        },
        getAllTransferableFileDescriptionCalls() {
            return transferableFileDescriptionCalls;
        }
    };
}
