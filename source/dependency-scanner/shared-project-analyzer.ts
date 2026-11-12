import type { FileSystemHost, Project } from 'ts-morph';
import { valueFingerprint } from '../common/value-fingerprint.ts';
import { observeCompilerInputs, type CompilerInputObservation } from './compiler-inputs.ts';
import type { CompilerInputValidator } from './compiler-input-validator.ts';
import { createFileSystemAdapters } from './typescript-file-host.ts';
import {
    createTypescriptProjectAnalyzer,
    type TypescriptProject,
    type TypescriptProjectAnalyzerDependencies
} from './typescript-project-analyzer.ts';
import type { AnalyzationOptions } from './typescript-compiler-options.ts';

type ProjectRequest = {
    readonly folder: string;
    readonly options: AnalyzationOptions;
    readonly currentDirectory: string;
};
type SharedProject = {
    readonly identity: string;
    readonly project: TypescriptProject;
    readonly inputs: CompilerInputObservation;
};
const maximumRetainedProjects = 2;
type SharedProjectDependencies = {
    readonly inputValidator: CompilerInputValidator;
    readonly fileSystemHost: FileSystemHost;
    readonly Project: typeof Project;
    readonly getReferencedModules: TypescriptProjectAnalyzerDependencies['getReferencedModules'];
};
type SharedProjectAnalyzer = {
    readonly analyzeProject: (folder: string, options: AnalyzationOptions) => Promise<TypescriptProject>;
};

function createSharedProject(dependencies: SharedProjectDependencies, request: ProjectRequest): SharedProject {
    const inputs = observeCompilerInputs(dependencies.fileSystemHost);
    const analyzer = createTypescriptProjectAnalyzer({
        ...dependencies,
        fileSystemAdapters: createFileSystemAdapters({ fileSystemHost: inputs.fileSystemHost })
    });
    const original = analyzer.analyzeProject(request.folder, request.options);
    const references = new Map<string, ReturnType<TypescriptProject['getReferencedModules']>>();
    return {
        identity: valueFingerprint(request),
        inputs,
        project: {
            ...original,
            getReferencedModules(filePath) {
                const found = references.get(filePath) ?? original.getReferencedModules(filePath);
                references.set(filePath, found);
                return found;
            }
        }
    };
}

export function createSharedProjectAnalyzer(dependencies: SharedProjectDependencies): SharedProjectAnalyzer {
    let projects: readonly SharedProject[] = [];
    async function isCurrent(project: SharedProject): Promise<boolean> {
        const snapshot = project.inputs.snapshot();
        return snapshot !== null && await dependencies.inputValidator.isCurrent(snapshot);
    }
    return {
        async analyzeProject(folder, options) {
            const request = {
                folder,
                options: structuredClone(options),
                currentDirectory: dependencies.fileSystemHost.getCurrentDirectory()
            };
            const identity = valueFingerprint(request);
            const existing = projects.find(function (candidate) {
                return candidate.identity === identity;
            });
            if (existing !== undefined && await isCurrent(existing)) {
                return existing.project;
            }
            const created = createSharedProject(dependencies, request);
            projects = [
                created,
                ...projects.filter(function (candidate) {
                    return candidate !== existing;
                })
            ]
                .slice(0, maximumRetainedProjects);
            return created.project;
        }
    };
}
