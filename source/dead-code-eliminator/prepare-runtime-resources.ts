import { isDeclarationCodeFile } from '../common/code-files.ts';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import { createExpressionPurityChecker } from './pure-expression.ts';
import { createRuntimeModuleResolver } from './runtime-module-resolution.ts';
import { prepareBundleSources } from './transform/bundle-source-preparation.ts';
import { bypassFunctionForwarding } from './transform/function-forwarding.ts';
import type { LoadedResource, LoadedCodeResource } from './load-resource.ts';

function isRuntimeCodeResource(entry: LoadedResource): entry is LoadedCodeResource {
    return entry.sourceFile !== undefined && !isDeclarationCodeFile(entry.sourceFile.getFilePath());
}

export function prepareRuntimeResources(
    loaded: readonly LoadedResource[],
    deadCodeElimination: DeadCodeEliminationSettings | undefined
): readonly LoadedResource[] {
    const origins = loaded.flatMap(function (entry) {
        return entry.sourceFile === undefined ? [] : {
            sourceFile: entry.sourceFile,
            targetFilePath: entry.resource.fileDescription.targetFilePath,
            inputFilePath: entry.resource.fileDescription.inputFilePath,
            moduleReferences: entry.resource.moduleReferences
        };
    });
    const resolveModule = createRuntimeModuleResolver(origins);
    const isPure = createExpressionPurityChecker(deadCodeElimination, resolveModule);
    prepareBundleSources(loaded.filter(isRuntimeCodeResource), origins, resolveModule, isPure);
    return bypassFunctionForwarding(loaded);
}
