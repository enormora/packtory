import { ts as typescript } from 'ts-morph';
import { isCodeFile } from '../common/code-files.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { resolvePublicModuleInputFilePath } from './public-specifiers.ts';

type UsageRecorder = {
    readonly recordUsage: (bundleName: string, inputFilePath: string) => void;
    readonly usages: ReadonlyMap<string, ReadonlySet<string>>;
};

function* collectModuleSpecifiers(bundle: AnalyzedBundle): Generator<string, void, void> {
    const codeResources = bundle.contents.filter(function isCodeResource(resource) {
        return isCodeFile(resource.fileDescription.targetFilePath);
    });
    for (const resource of codeResources) {
        const { content } = resource.fileDescription;
        const parsedFile = typescript.preProcessFile(content, true);
        for (const literal of parsedFile.importedFiles) {
            yield literal.fileName;
        }
    }
}

function createUsageRecorder(): UsageRecorder {
    const usages = new Map<string, Set<string>>();

    return {
        usages,
        recordUsage(bundleName, inputFilePath) {
            const existing = usages.get(bundleName) ?? new Set<string>();
            existing.add(inputFilePath);
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
            const inputFilePath = resolvePublicModuleInputFilePath(target, specifier);
            if (inputFilePath !== undefined) {
                recorder.recordUsage(target.name, inputFilePath);
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
