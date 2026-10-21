import type { PackageFileInspection } from '../../packtory/packtory-results.ts';

type InspectedFile = PackageFileInspection['files'][number];

function renderFile(file: InspectedFile): readonly string[] {
    const source = file.sourcePath ?? 'generated manifest';
    const title = `  ${file.packagePath} (${source})`;
    if (file.discovery.type === 'unavailable') {
        return [ title, '    Discovery chain unavailable' ];
    }
    return [
        title,
        ...file.discovery.chain.map(function (step) {
            return `    ${step.via}: ${step.packagePath}`;
        })
    ];
}

export function renderTerminalPackageFiles(inspection: PackageFileInspection): string {
    return [
        'Packtory files [Dry run]',
        inspection.packageName,
        'Source discovery before dead-code elimination; not a symbol retention explanation.',
        ...inspection.files.length === 0 ? [ 'No retained files.' ] : inspection.files.flatMap(renderFile),
        ''
    ]
        .join('\n');
}
