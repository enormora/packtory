import { reuseFileRead, type FileManager } from '../file-manager/file-manager.ts';

export type VendorDiscoveryFileManager = Pick<
    FileManager,
    'checkReadability' | 'getRealPath' | 'isExecutable' | 'listDirectoryEntries' | 'readFile'
>;

export function createVendorDiscoverySession(
    fileManager: VendorDiscoveryFileManager
): VendorDiscoveryFileManager {
    return {
        checkReadability: reuseFileRead(fileManager.checkReadability),
        getRealPath: reuseFileRead(fileManager.getRealPath),
        isExecutable: reuseFileRead(fileManager.isExecutable),
        listDirectoryEntries: reuseFileRead(fileManager.listDirectoryEntries),
        readFile: reuseFileRead(fileManager.readFile)
    };
}
