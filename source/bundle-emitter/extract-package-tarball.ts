import type { FileDescription } from '../file-manager/file-description.ts';
import { isExecutableFileMode } from '../file-manager/permissions.ts';
import { extractTarEntries, type TarEntry } from '../tar/extract-tar.ts';

function tarEntryToFileDescription(tarEntry: TarEntry): FileDescription {
    return {
        filePath: tarEntry.header.name,
        content: tarEntry.content,
        isExecutable: isExecutableFileMode(Number(tarEntry.header.mode))
    };
}

export async function extractPackageTarball(tarball: Buffer): Promise<readonly FileDescription[]> {
    const tarEntries = await extractTarEntries(tarball);
    return tarEntries.map(tarEntryToFileDescription);
}
