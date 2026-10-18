import assert from 'node:assert/strict';
import type {
    WorkloadDefinition,
    WorkloadSize,
    CommandLineInterfaceWorkloadDefinition,
    CommandLineInterfaceWorkloadSize
} from './benchmark-types.ts';

export type GeneratedCounts = {
    readonly packageCount: number;
    readonly javaScriptFileCount: number;
    readonly declarationFileCount: number;
    readonly sourceMapFileCount: number;
    readonly maximumImportFanOut: number;
};

function createGeneratedWorkloadCountMismatchMessage(
    size: WorkloadSize,
    actualCount: number,
    expectedCount: number,
    fileKind: string
): string {
    return [ `Generated workload "${size}" produced ${actualCount} ${fileKind},`, `expected ${expectedCount}` ].join(
        ' '
    );
}

function createGeneratedWorkloadFanOutMismatchMessage(
    size: WorkloadSize,
    actualFanOut: number,
    expectedFanOut: number
): string {
    return [
        `Generated workload "${size}" produced max import fan-out ${actualFanOut},`,
        `expected at most ${expectedFanOut}`
    ]
        .join(' ');
}

export function validateGeneratedWorkload(
    definition: WorkloadDefinition,
    counts: GeneratedCounts,
    size: WorkloadSize
): void {
    assert.ok(
        counts.packageCount === definition.packageCount,
        `Generated workload "${size}" produced ${counts.packageCount} packages, expected ${definition.packageCount}`
    );
    assert.ok(
        counts.javaScriptFileCount === definition.javaScriptFileCount,
        createGeneratedWorkloadCountMismatchMessage(
            size,
            counts.javaScriptFileCount,
            definition.javaScriptFileCount,
            'JavaScript files'
        )
    );
    assert.ok(
        counts.declarationFileCount === definition.declarationFileCount,
        createGeneratedWorkloadCountMismatchMessage(
            size,
            counts.declarationFileCount,
            definition.declarationFileCount,
            'declaration files'
        )
    );
    assert.ok(
        counts.sourceMapFileCount === definition.sourceMapFileCount,
        createGeneratedWorkloadCountMismatchMessage(
            size,
            counts.sourceMapFileCount,
            definition.sourceMapFileCount,
            'source maps'
        )
    );
    assert.ok(
        counts.maximumImportFanOut <= definition.maximumImportFanOut,
        createGeneratedWorkloadFanOutMismatchMessage(size, counts.maximumImportFanOut, definition.maximumImportFanOut)
    );
}

function createGeneratedCommandLineInterfaceWorkloadCountMismatchMessage(
    size: CommandLineInterfaceWorkloadSize,
    actualCount: number,
    expectedCount: number,
    fileKind: string
): string {
    return [ `Generated CLI workload "${size}" produced ${actualCount} ${fileKind},`, `expected ${expectedCount}` ]
        .join(
            ' '
        );
}

function createGeneratedCommandLineInterfaceWorkloadFanOutMismatchMessage(
    size: CommandLineInterfaceWorkloadSize,
    actualFanOut: number,
    expectedFanOut: number
): string {
    return [
        `Generated CLI workload "${size}" produced max import fan-out ${actualFanOut},`,
        `expected at most ${expectedFanOut}`
    ]
        .join(' ');
}

export function validateGeneratedCommandLineInterfaceWorkload(
    definition: CommandLineInterfaceWorkloadDefinition,
    counts: GeneratedCounts,
    size: CommandLineInterfaceWorkloadSize
): void {
    assert.ok(
        counts.packageCount === definition.packageCount,
        `Generated CLI workload "${size}" produced ${counts.packageCount} packages, expected ${definition.packageCount}`
    );
    assert.ok(
        counts.javaScriptFileCount === definition.javaScriptFileCount,
        createGeneratedCommandLineInterfaceWorkloadCountMismatchMessage(
            size,
            counts.javaScriptFileCount,
            definition.javaScriptFileCount,
            'JavaScript files'
        )
    );
    assert.ok(
        counts.declarationFileCount === definition.declarationFileCount,
        createGeneratedCommandLineInterfaceWorkloadCountMismatchMessage(
            size,
            counts.declarationFileCount,
            definition.declarationFileCount,
            'declaration files'
        )
    );
    assert.ok(
        counts.sourceMapFileCount === definition.sourceMapFileCount,
        createGeneratedCommandLineInterfaceWorkloadCountMismatchMessage(
            size,
            counts.sourceMapFileCount,
            definition.sourceMapFileCount,
            'source maps'
        )
    );
    assert.ok(
        counts.maximumImportFanOut <= definition.maximumImportFanOut,
        createGeneratedCommandLineInterfaceWorkloadFanOutMismatchMessage(
            size,
            counts.maximumImportFanOut,
            definition.maximumImportFanOut
        )
    );
}
