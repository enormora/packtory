import type { FileManager } from '../../file-manager/file-manager.ts';
import type { BuildReport, Packtory } from '../../packtory/packtory.ts';
import { buildPreviewDocument } from '../../report/preview/preview-document.ts';
import { renderHtmlReport } from '../../report/html-renderer/html-renderer.ts';

const jsonIndentSpaces = 2;

export type ReportFlags = {
    readonly reportJson: boolean;
    readonly reportHtml: boolean;
};
type WriteReportsInput = {
    readonly dryRun: boolean;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly flags: ReportFlags;
    readonly report: BuildReport | undefined;
    readonly result: Awaited<ReturnType<Packtory['buildAndPublishAll']>>['result'];
};

export function createEmptyReport(): BuildReport {
    const generatedAt = new Date();
    return {
        schemaVersion: 1,
        generatedAt: generatedAt.toISOString(),
        packages: {},
        aggregate: { crossBundleLinks: [] }
    };
}

export async function writeReports(input: WriteReportsInput): Promise<void> {
    const { dryRun, fileManager, flags, report, result } = input;
    if (report === undefined) {
        return;
    }
    if (flags.reportJson) {
        await fileManager.writeFile('packtory-report.json', `${JSON.stringify(report, undefined, jsonIndentSpaces)}\n`);
    }
    if (flags.reportHtml) {
        const document = await buildPreviewDocument({ report, result, dryRun, fileManager });
        await fileManager.writeFile('packtory-report.html', renderHtmlReport(document));
    }
}
