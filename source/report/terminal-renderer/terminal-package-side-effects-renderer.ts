import type {
    GeneratedPackageSideEffectsDecision,
    PackageSideEffectsDecision,
    PackageSideEffectsFile,
    PackageSideEffectsInspection
} from '../../packtory/packtory-results.ts';
import { createColors, type Colors } from './terminal-preview-renderer-shared.ts';

type TerminalPackageSideEffectsRendererOptions = {
    readonly color?: boolean | undefined;
};

function renderJsonValue(value: unknown): string {
    return JSON.stringify(value);
}

function renderGeneratedDecision(decision: GeneratedPackageSideEffectsDecision): string {
    if (decision.type === 'side-effects-false') {
        return 'false';
    }

    if (decision.type === 'side-effects-list') {
        return renderJsonValue(decision.paths);
    }

    return 'omitted (every runtime file has side effects)';
}

function renderDecision(decision: PackageSideEffectsDecision): readonly string[] {
    if (decision.type !== 'user-provided-side-effects') {
        return [ `Generated package.json sideEffects: ${renderGeneratedDecision(decision)}` ];
    }

    return [
        `package.json sideEffects: user-provided ${renderJsonValue(decision.providedValue)}`,
        `Generated package.json sideEffects without override: ${renderGeneratedDecision(decision.generated)}`
    ];
}

function renderStatements(file: PackageSideEffectsFile): readonly string[] {
    return file.statements.map(function (statement) {
        return `    line ${statement.line}: ${statement.kind}`;
    });
}

function renderFile(file: PackageSideEffectsFile, colors: Colors): readonly string[] {
    return [
        `  ${colors.bold(file.packagePath)} (${file.sourcePath})`,
        ...renderStatements(file)
    ];
}

function renderImpureFiles(
    impureFiles: readonly PackageSideEffectsFile[],
    colors: Colors
): readonly string[] {
    if (impureFiles.length === 0) {
        return [ 'No runtime side effects.' ];
    }

    return [
        'Runtime side effects',
        ...impureFiles.flatMap(function (file) {
            return renderFile(file, colors);
        })
    ];
}

export function renderTerminalPackageSideEffects(
    inspection: PackageSideEffectsInspection,
    options: TerminalPackageSideEffectsRendererOptions = {}
): string {
    const colors = createColors(options.color);
    const lines = [
        'Packtory side effects [Dry run]',
        colors.bold(inspection.packageName),
        ...renderDecision(inspection.packageJsonDecision),
        ...renderImpureFiles(inspection.impureFiles, colors)
    ];
    return `${lines.join('\n')}\n`;
}
