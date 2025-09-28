import type { FileDescription } from '../file-manager/file-description.ts';
import { isExecutableFileMode } from '../file-manager/permissions.ts';
import { extractTarEntries, type TarEntry } from '../tar/extract-tar.ts';

function tarEntryToFileDescription(tarEntry: TarEntry): FileDescription {
    const isExecutable = tarEntry.header.mode === undefined ? false : isExecutableFileMode(tarEntry.header.mode);

    return {
        filePath: tarEntry.header.name,
        content: tarEntry.content,
        isExecutable
    };
}

export async function extractPackageTarball(tarball: Buffer): Promise<readonly FileDescription[]> {
    const tarEntries = await extractTarEntries(tarball);
    return tarEntries.map(tarEntryToFileDescription);
}
