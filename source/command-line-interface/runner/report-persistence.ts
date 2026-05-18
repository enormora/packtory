import type { FileManager } from '../../file-manager/file-manager.ts';
import type { BuildReport, Packtory } from '../../packtory/packtory.ts';
import { buildPreviewDocument } from '../../report/preview/preview-document.ts';
import { renderHtmlReport } from '../../report/html-renderer/html-renderer.ts';

const jsonIndentSpaces = 2;

export type ReportFlags = {
    readonly reportJson: boolean;
    readonly reportHtml: boolean;
};

export function createEmptyReport(): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        packages: {},
        aggregate: { crossBundleLinks: [] }
    };
}

// eslint-disable-next-line @typescript-eslint/max-params -- report persistence needs shared flags plus build outcome/report data
export async function writeReports(
    fileManager: Pick<FileManager, 'readFile' | 'writeFile'>,
    report: BuildReport | undefined,
    result: Awaited<ReturnType<Packtory['buildAndPublishAll']>>['result'],
    flags: ReportFlags,
    dryRun: boolean
): Promise<void> {
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
