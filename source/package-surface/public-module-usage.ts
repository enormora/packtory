import { ts as typescript } from 'ts-morph';
import { isCodeFile } from '../common/code-files.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { resolvePublicModuleSourceFilePath } from './public-specifiers.ts';

type UsageRecorder = {
    readonly recordUsage: (bundleName: string, sourceFilePath: string) => void;
    readonly usages: ReadonlyMap<string, ReadonlySet<string>>;
};

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

function createUsageRecorder(): UsageRecorder {
    const usages = new Map<string, Set<string>>();

    return {
        usages,
        recordUsage(bundleName, sourceFilePath) {
            const existing = usages.get(bundleName) ?? new Set<string>();
            existing.add(sourceFilePath);
            usages.set(bundleName, existing);
        }
    };
}

function recordConsumerPublicModuleUsage(
    recorder: UsageRecorder,
    bundles: readonly AnalyzedBundle[],
    consumer: AnalyzedBundle
): void {
    const specifiers = collectModuleSpecifiers(consumer);
    for (const specifier of specifiers) {
        const otherBundles = bundles.filter(function (bundle) {
            return bundle.name !== consumer.name;
        });
        for (const target of otherBundles) {
            const sourceFilePath = resolvePublicModuleSourceFilePath(target, specifier);
            if (sourceFilePath !== undefined) {
                recorder.recordUsage(target.name, sourceFilePath);
            }
        }
    }
}

export function collectPublicModuleUsage(bundles: readonly AnalyzedBundle[]): ReadonlyMap<string, ReadonlySet<string>> {
    const recorder = createUsageRecorder();

    for (const consumer of bundles) {
        recordConsumerPublicModuleUsage(recorder, bundles, consumer);
    }

    return recorder.usages;
}
