import { ts as typescript } from 'ts-morph';
import { isCodeFile } from '../common/code-files.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { resolvePublicModuleSourceFilePath } from './modules.ts';

function recordUsage(usages: Map<string, Set<string>>, bundleName: string, sourceFilePath: string): void {
    const existing = usages.get(bundleName) ?? new Set<string>();
    existing.add(sourceFilePath);
    usages.set(bundleName, existing);
}

function* collectModuleSpecifiers(bundle: AnalyzedBundle): Generator<string, void, void> {
    for (const resource of bundle.contents) {
        const { targetFilePath, content } = resource.fileDescription;
        if (isCodeFile(targetFilePath)) {
            const parsedFile = typescript.preProcessFile(content, true);
            for (const literal of parsedFile.importedFiles) {
                yield literal.fileName;
            }
        }
    }
}

export function collectPublicModuleUsage(bundles: readonly AnalyzedBundle[]): ReadonlyMap<string, ReadonlySet<string>> {
    const usages = new Map<string, Set<string>>();

    for (const consumer of bundles) {
        const specifiers = collectModuleSpecifiers(consumer);
        for (const specifier of specifiers) {
            for (const target of bundles) {
                if (target.name !== consumer.name) {
                    const sourceFilePath = resolvePublicModuleSourceFilePath(target, specifier);
                    if (sourceFilePath !== undefined) {
                        recordUsage(usages, target.name, sourceFilePath);
                    }
                }
            }
        }
    }

    return usages;
}
