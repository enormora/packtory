import { z } from 'zod/mini';
import { ts as typescript } from 'ts-morph';
import type { AnalysisStorage } from '../analysis-storage.ts';
import { createPackageAnalysisIdentity } from '../package-analysis-identity.ts';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import {
    compilerInputsSchema,
    observeCompilerInputs,
    type CompilerInputObservation
} from '../../dependency-scanner/compiler-inputs.ts';
import type { CompilerInputValidator } from '../../dependency-scanner/compiler-input-validator.ts';
import { createFileSystemAdapters } from '../../dependency-scanner/typescript-file-host.ts';
import {
    createDeclarationProjectFactory,
    type DeclarationProjectDependencies
} from './type-script-declaration-project.ts';
import {
    createDeclarationIntegritySummarizer,
    type DeclarationIntegritySummarizer
} from './type-script-declaration-integrity.ts';

const validationSchema = z.object({ inputs: compilerInputsSchema, issues: z.array(z.string()) });
type ResolutionPackages = ReadonlyMap<string, PublishedPackageWithManifest>;
type ValidationContext = {
    readonly summarize: DeclarationIntegritySummarizer;
    readonly observation: CompilerInputObservation;
    readonly fingerprint: string;
};
type ValidationDependencies = DeclarationProjectDependencies & {
    readonly storage: AnalysisStorage;
    readonly inputValidator: CompilerInputValidator;
};
export type DeclarationValidation = (
    ...parameters: Parameters<DeclarationIntegritySummarizer>
) => Promise<readonly string[]>;

function createValidationContext(dependencies: ValidationDependencies, fingerprint: string): ValidationContext {
    const observation = observeCompilerInputs(dependencies.fileSystemHost);
    return {
        fingerprint,
        observation,
        summarize: createDeclarationIntegritySummarizer({
            createDeclarationProjects: createDeclarationProjectFactory({
                ...dependencies,
                fileSystemHost: createFileSystemAdapters({ fileSystemHost: observation.fileSystemHost })
                    .fileSystemHostWithoutFilter
            })
        })
    };
}

export function createDeclarationValidation(dependencies: ValidationDependencies): DeclarationValidation {
    const contexts = new WeakMap<ResolutionPackages, ValidationContext>();
    const identities = createPackageAnalysisIdentity();
    async function contextFor(packages: ResolutionPackages, fingerprint: string): Promise<ValidationContext> {
        const existing = contexts.get(packages);
        if (existing?.fingerprint === fingerprint) {
            const inputs = existing.observation.snapshot();
            if (inputs !== null && await dependencies.inputValidator.isCurrent(inputs)) {
                return existing;
            }
        }
        const context = createValidationContext(dependencies, fingerprint);
        contexts.set(packages, context);
        return context;
    }
    async function recordValidation(
        key: unknown,
        context: ValidationContext,
        issues: readonly string[]
    ): Promise<void> {
        const inputs = context.observation.snapshot();
        if (inputs !== null) {
            await dependencies.storage.write(key, { inputs, issues });
        }
    }
    return async function validateDeclarations(packageName, publishedPackage, declarationMode, resolutionPackages) {
        const fingerprint = identities.resolution(resolutionPackages);
        const key = [
            typescript.version,
            dependencies.packageResolutionBaseFolder,
            dependencies.fileSystemHost.getCurrentDirectory(),
            packageName,
            identities.package(publishedPackage),
            declarationMode,
            fingerprint
        ];
        const cached = await dependencies.storage.read(key, validationSchema);
        if (cached !== null && await dependencies.inputValidator.isCurrent(cached.inputs)) {
            return cached.issues;
        }
        const context = await contextFor(resolutionPackages, fingerprint);
        const issues = context.summarize(packageName, publishedPackage, declarationMode, resolutionPackages);
        await recordValidation(key, context, issues);
        return issues;
    };
}
