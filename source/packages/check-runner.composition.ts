import { createRequire } from 'node:module';
import { checkPackage, Package } from '@arethetypeswrong/core';
import {
    problemAffectsEntrypointResolution,
    problemAffectsResolutionKind,
    problemKindInfo as problemKindInformation
} from '@arethetypeswrong/core/problems';
import { RealFileSystemHost } from '@ts-morph/common';
import type { Project } from 'ts-morph';
import type { FileManager } from '../file-manager/file-manager.ts';
import { createCheckRunner, type CheckRunner } from '../checks/check-runner.ts';
import { createAllRules } from '../checks/rules/registry.ts';
import { createDeclarationValidation } from '../checks/rules/declaration-validation.ts';
import { createPackageResolutionAnalyzer } from '../checks/rules/type-script-package-resolution.ts';
import { createAnalysisStorage } from '../checks/analysis-storage.ts';
import type { CompilerInputValidator } from '../dependency-scanner/compiler-input-validator.ts';

type CheckRunnerCompositionOptions = {
    readonly repositoryFolder: string;
    readonly fileManager: FileManager;
    readonly inputValidator: CompilerInputValidator;
    readonly Project: typeof Project;
    readonly toolIdentity: () => Promise<string>;
};

export function buildCheckRunner(options: CheckRunnerCompositionOptions): CheckRunner {
    const { repositoryFolder, fileManager, inputValidator, Project, toolIdentity } = options;
    const resolutionVersions: unknown = createRequire(import.meta.url)('@arethetypeswrong/core/versions');
    const storage = createAnalysisStorage({
        repositoryFolder,
        fileManager,
        async toolIdentity() {
            return JSON.stringify([ await toolIdentity(), resolutionVersions, process.version, process.platform ]);
        }
    });
    const rules = createAllRules({
        fileManager,
        analyzePackageResolution: createPackageResolutionAnalyzer({
            storage,
            Package,
            checkPackage,
            problemKindInformation,
            problemAffectsResolutionKind,
            problemAffectsEntrypointResolution
        }),
        summarizeDeclarationIntegrity: createDeclarationValidation({
            storage,
            inputValidator,
            Project,
            fileSystemHost: new RealFileSystemHost(),
            packageResolutionBaseFolder: repositoryFolder
        })
    });

    return createCheckRunner({ rules });
}
