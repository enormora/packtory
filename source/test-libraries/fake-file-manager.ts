import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';

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

type WriteFileCall = {
    readonly filePath: string;
    readonly content: string;
};

type CopyFileCall = {
    readonly from: string;
    readonly to: string;
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
    readonly simulatedCheckReadabilityResponses?: readonly SimulatedResponse<ReadabilityResult>[];
    readonly simulatedTransferableFileDescriptionResponses?: readonly SimulatedResponse<TransferableFileDescription>[];
    readonly transferableFileDescriptionResponder?: TransferableFileDescriptionResponder;
    readonly simulatedWriteFileResponses?: readonly SimulatedVoidResponse[];
    readonly simulatedCopyFileResponses?: readonly SimulatedVoidResponse[];
};

export type FakeFileManager = FileManager & {
    readonly getReadFileCallCount: () => number;
    readonly getReadFileCall: (index: number) => ReadFileCall;
    readonly getAllReadFileCalls: () => readonly ReadFileCall[];

    readonly getWriteFileCallCount: () => number;
    readonly getWriteFileCall: (index: number) => WriteFileCall;
    readonly getAllWriteFileCalls: () => readonly WriteFileCall[];

    readonly getCopyFileCallCount: () => number;
    readonly getCopyFileCall: (index: number) => CopyFileCall;
    readonly getAllCopyFileCalls: () => readonly CopyFileCall[];

    readonly getCheckReadabilityCallCount: () => number;
    readonly getCheckReadabilityCall: (index: number) => CheckReadabilityCall;
    readonly getAllCheckReadabilityCalls: () => readonly CheckReadabilityCall[];

    readonly getTransferableFileDescriptionCallCount: () => number;
    readonly getTransferableFileDescriptionCall: (index: number) => TransferableFileDescriptionCall;
    readonly getAllTransferableFileDescriptionCalls: () => readonly TransferableFileDescriptionCall[];
};

const defaultReadFileResponse: SimulatedResponse<string> = { value: '' };
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
        simulatedCheckReadabilityResponses = [],
        simulatedTransferableFileDescriptionResponses = [],
        transferableFileDescriptionResponder,
        simulatedWriteFileResponses = [],
        simulatedCopyFileResponses = []
    } = options;

    const readFileCalls: ReadFileCall[] = [];
    const writeFileCalls: WriteFileCall[] = [];
    const copyFileCalls: CopyFileCall[] = [];
    const checkReadabilityCalls: CheckReadabilityCall[] = [];
    const transferableFileDescriptionCalls: TransferableFileDescriptionCall[] = [];

    return {
        async readFile(filePath) {
            const response = simulatedReadFileResponses[readFileCalls.length] ?? defaultReadFileResponse;
            readFileCalls.push({ filePath });
            return resolveValueResponse(response);
        },

        async writeFile(filePath, content) {
            const response = simulatedWriteFileResponses[writeFileCalls.length] ?? defaultVoidResponse;
            writeFileCalls.push({ filePath, content });
            resolveVoidResponse(response);
        },

        async copyFile(from, to) {
            const response = simulatedCopyFileResponses[copyFileCalls.length] ?? defaultVoidResponse;
            copyFileCalls.push({ from, to });
            resolveVoidResponse(response);
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

        getWriteFileCallCount() {
            return writeFileCalls.length;
        },
        getWriteFileCall(index) {
            return getCallAtIndex(writeFileCalls, 'writeFile', index);
        },
        getAllWriteFileCalls() {
            return writeFileCalls;
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
