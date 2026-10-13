import type { FileManager } from '../../file-manager/file-manager.ts';
import type { BuildReport, Packtory } from '../../packtory/packtory.ts';
import { buildPreviewDocument } from '../../report/preview/preview-document.ts';
import * as webReport from '../../report/hypertext-markup-language-renderer/hypertext-markup-language-renderer.ts';

const javaScriptObjectNotationIndentSpaces = 2;

export type ReportFlags = {
    readonly reportJavaScriptObjectNotation: boolean;
    readonly reportHypertextMarkupLanguage: boolean;
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
    if (flags.reportJavaScriptObjectNotation) {
        await fileManager.writeFile(
            'packtory-report.json',
            `${JSON.stringify(report, undefined, javaScriptObjectNotationIndentSpaces)}\n`
        );
    }
    if (flags.reportHypertextMarkupLanguage) {
        const document = await buildPreviewDocument({ report, result, dryRun, fileManager });
        await fileManager.writeFile('packtory-report.html', webReport.renderHypertextMarkupLanguageReport(document));
    }
}
