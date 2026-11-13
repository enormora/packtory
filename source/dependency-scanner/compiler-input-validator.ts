import { AsyncLocalStorage } from 'node:async_hooks';
import { reuseFileRead, type FileManager } from '../file-manager/file-manager.ts';
import { compilerInputsAreCurrent, type CompilerInputs } from './compiler-inputs.ts';

export type AnalysisInputScope = <Result>(analyze: () => Promise<Result>) => Promise<Result>;
export type CompilerInputValidator = {
    readonly run: AnalysisInputScope;
    readonly isCurrent: (inputs: CompilerInputs) => Promise<boolean>;
};
type ReadSession = Pick<FileManager, 'checkDirectory' | 'getRealPath' | 'listDirectoryEntries' | 'readFile'>;

function createReadSession(fileManager: FileManager): ReadSession {
    return {
        readFile: reuseFileRead(fileManager.readFile),
        checkDirectory: reuseFileRead(fileManager.checkDirectory),
        listDirectoryEntries: reuseFileRead(fileManager.listDirectoryEntries),
        getRealPath: reuseFileRead(fileManager.getRealPath)
    };
}

export function createCompilerInputValidator(fileManager: FileManager): CompilerInputValidator {
    const sessions = new AsyncLocalStorage<ReadSession>();
    const snapshotFiles: FileManager = {
        ...fileManager,
        async readFile(filePath) {
            return (sessions.getStore() ?? fileManager).readFile(filePath);
        },
        async checkDirectory(filePath) {
            return (sessions.getStore() ?? fileManager).checkDirectory(filePath);
        },
        async listDirectoryEntries(filePath) {
            return (sessions.getStore() ?? fileManager).listDirectoryEntries(filePath);
        },
        async getRealPath(filePath) {
            return (sessions.getStore() ?? fileManager).getRealPath(filePath);
        }
    };
    return {
        async run(analyze) {
            return sessions.run(createReadSession(fileManager), analyze);
        },
        async isCurrent(inputs) {
            return compilerInputsAreCurrent(snapshotFiles, inputs);
        }
    };
}
