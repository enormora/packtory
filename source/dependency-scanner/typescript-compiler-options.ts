import { ModuleKind, ModuleResolutionKind, type CompilerOptions } from 'ts-morph';
import type { MainPackageJson } from '../config/package-json.ts';

export type AnalyzationOptions = {
    readonly resolveDeclarationFiles: boolean;
    readonly mainPackageJson: MainPackageJson;
};

export function analyzationOptionsToCompilerOptions(options: AnalyzationOptions): CompilerOptions {
    const { resolveDeclarationFiles } = options;

    const compilerOptions: CompilerOptions = {
        moduleResolution: ModuleResolutionKind.Node16,
        esModuleInterop: true,
        maxNodeModuleJsDepth: 1,
        noEmit: true,
        allowJs: true,
        resolveJsonModule: true,
        noLib: true,
        skipLibCheck: true,
        module: ModuleKind.Node16,
        resolvePackageJsonImports: true
    };

    if (!resolveDeclarationFiles) {
        compilerOptions.types = [];
        compilerOptions.typeRoots = [];
    }

    return compilerOptions;
}
