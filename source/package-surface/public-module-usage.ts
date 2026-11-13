import { ts as typescript } from 'ts-morph';
import { isCodeFile } from '../common/code-files.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { indexPublicModules, type PublicModuleIndex } from './package-surface-index.ts';

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

type PublicModuleResolver = (bundle: AnalyzedBundle, specifier: string) => string | undefined;

function createPublicModuleResolver(): PublicModuleResolver {
    const indexes = new Map<AnalyzedBundle, PublicModuleIndex>();
    return function (bundle, specifier) {
        const index = indexes.get(bundle) ?? indexPublicModules(bundle);
        indexes.set(bundle, index);
        return index.inputFilePathBySpecifier.get(specifier);
    };
}

function recordConsumerPublicModuleUsage(
    recorder: UsageRecorder,
    bundles: readonly AnalyzedBundle[],
    consumer: AnalyzedBundle,
    resolvePublicModuleInputFilePath: PublicModuleResolver
): void {
    const otherBundles = bundles.filter(function (bundle) {
        return bundle.name !== consumer.name;
    });
    const specifiers = collectModuleSpecifiers(consumer);
    for (const specifier of specifiers) {
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
    const resolvePublicModuleInputFilePath = createPublicModuleResolver();

    for (const consumer of bundles) {
        recordConsumerPublicModuleUsage(recorder, bundles, consumer, resolvePublicModuleInputFilePath);
    }

    return recorder.usages;
}
