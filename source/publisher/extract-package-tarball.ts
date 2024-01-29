import type { FileDescription } from '../file-description/file-description.js';
import { extractTarEntries, type TarEntry } from '../tar/extract-tar.js';

function tarEntryToFileDescription(tarEntry: TarEntry): FileDescription {
    return {
        filePath: tarEntry.header.name,
        content: tarEntry.content
    };
}

export async function extractPackageTarball(tarball: Buffer): Promise<readonly FileDescription[]> {
    const tarEntries = await extractTarEntries(tarball);
    return tarEntries.map(tarEntryToFileDescription);
}
