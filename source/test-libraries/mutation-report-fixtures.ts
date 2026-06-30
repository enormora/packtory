import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const killedMutant = { status: 'Killed', location: { start: { line: 1, column: 2 } } };
export const timeoutMutant = { status: 'Timeout', location: { start: { line: 7, column: 8 } } };

type SingleMutantReport = {
    readonly files: Readonly<Record<string, { readonly mutants: readonly unknown[]; }>>;
};

export function singleMutantReport(mutant: unknown): SingleMutantReport {
    return { files: { 'source/a.ts': { mutants: [ mutant ] } } };
}

export async function withTemporaryReportDirectory<T>(
    relativePath: string,
    contents: string,
    action: (reportPath: string, directory: string) => Promise<T>
): Promise<T> {
    const directory = await mkdtemp(path.join(tmpdir(), 'packtory-mutation-check-'));
    const reportPath = path.join(directory, relativePath);

    try {
        await mkdir(path.dirname(reportPath), { recursive: true });
        await writeFile(reportPath, contents);
        return await action(reportPath, directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
