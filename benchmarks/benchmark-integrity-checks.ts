import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { CheckRunner } from '../source/checks/check-runner.ts';
import type { CompilerInputValidator } from '../source/dependency-scanner/compiler-input-validator.ts';
import { buildCheckRunner } from '../source/packages/check-runner.composition.ts';
import { observeTypeScriptParsing } from './benchmark-typescript-observation.ts';

export function createBenchmarkIntegrityChecks(
    repositoryFolder: string,
    fileManager: FileManager,
    recordParsedBytes: (bytes: number) => void,
    inputValidator: CompilerInputValidator
): CheckRunner {
    return buildCheckRunner({
        repositoryFolder,
        fileManager,
        inputValidator,
        Project: observeTypeScriptParsing(recordParsedBytes),
        async toolIdentity() {
            return 'benchmark';
        }
    });
}
