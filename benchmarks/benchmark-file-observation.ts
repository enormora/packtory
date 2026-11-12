import path from 'node:path';
import type { FileSystemHost } from 'ts-morph';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { WorkMetrics } from './performance-benchmark-types.ts';

export type BenchmarkFileInputs = {
    readonly fileManager: FileManager;
    readonly fileSystemHost: FileSystemHost;
    readonly sourceFiles: ReadonlyMap<string, string>;
    readonly reachableFiles: ReadonlySet<string>;
    readonly inventoryFiles: ReadonlyMap<string, Buffer>;
};
export type BenchmarkFileObservation = {
    readonly fileManager: FileManager;
    readonly fileSystemHost: FileSystemHost;
    readonly reset: () => void;
    readonly metrics: () => WorkMetrics;
};
type PathReads = {
    readonly counts: ReadonlyMap<string, number>;
    readonly record: (filePath: string) => void;
    readonly reset: () => void;
    readonly amplification: () => number;
};

function createPathReads(): PathReads {
    const counts = new Map<string, number>();
    return {
        counts,
        record(filePath) {
            counts.set(filePath, (counts.get(filePath) ?? 0) + 1);
        },
        reset() {
            counts.clear();
        },
        amplification() {
            return counts.size === 0 ? 0 : Array.from(counts.values()).reduce(function (total, count) {
                return total + count;
            }, 0) / counts.size;
        }
    };
}

function observeCompilerReads(inputs: BenchmarkFileInputs, reads: PathReads): FileSystemHost {
    return new Proxy(inputs.fileSystemHost, {
        get(target, property) {
            const member: unknown = Reflect.get(target, property);
            if (typeof member !== 'function') {
                return member;
            }
            return function (...methodArguments: readonly unknown[]): unknown {
                const [ filePath ] = methodArguments;
                if (
                    typeof filePath === 'string' && [ 'readFileSync', 'readFile' ].includes(String(property)) &&
                    inputs.sourceFiles.has(filePath)
                ) {
                    reads.record(filePath);
                }
                return Reflect.apply(member, target, methodArguments);
            };
        }
    });
}

function sourceReadMetrics(
    inputs: BenchmarkFileInputs,
    reads: PathReads
): Pick<WorkMetrics, 'sourceBytesRead' | 'sourceReadAmplification' | 'unreachableSourceBytes'> {
    const reachableBytes = Array.from(inputs.reachableFiles).reduce(function (total, filePath) {
        return total + Buffer.byteLength(inputs.sourceFiles.get(filePath) ?? '');
    }, 0);
    const bytesByPath = Array.from(reads.counts, function ([ filePath, count ]) {
        return { filePath, bytes: Buffer.byteLength(inputs.sourceFiles.get(filePath) ?? '') * count };
    });
    const sourceBytesRead = bytesByPath.reduce(function (total, file) {
        return total + file.bytes;
    }, 0);
    const unreachableSourceBytes = bytesByPath
        .filter(function isUnreachable(file) {
            return !inputs.reachableFiles.has(file.filePath);
        })
        .reduce(function (total, file) {
            return total + file.bytes;
        }, 0);
    return {
        sourceBytesRead,
        unreachableSourceBytes,
        sourceReadAmplification: reachableBytes === 0 ? 0 : sourceBytesRead / reachableBytes
    };
}

export function observeBenchmarkFiles(inputs: BenchmarkFileInputs): BenchmarkFileObservation {
    const sourceReads = createPathReads();
    const manifestReads = createPathReads();
    const directoryReads = createPathReads();
    let inventoryPayloadBytes = 0;
    return {
        fileSystemHost: observeCompilerReads(inputs, sourceReads),
        fileManager: {
            ...inputs.fileManager,
            async readFile(filePath) {
                if (path.basename(filePath) === 'package.json') {
                    manifestReads.record(filePath);
                }
                return inputs.fileManager.readFile(filePath);
            },
            async listDirectoryEntries(directoryPath) {
                directoryReads.record(directoryPath);
                return inputs.fileManager.listDirectoryEntries(directoryPath);
            },
            async getTransferableFileDescriptionFromPath(inputFilePath, targetFilePath) {
                const description = await inputs.fileManager.getTransferableFileDescriptionFromPath(
                    inputFilePath,
                    targetFilePath
                );
                if (path.basename(inputFilePath) !== 'package.json' && inputs.inventoryFiles.has(inputFilePath)) {
                    inventoryPayloadBytes += inputs.inventoryFiles.get(inputFilePath)?.byteLength ?? 0;
                }
                return description;
            }
        },
        reset() {
            sourceReads.reset();
            manifestReads.reset();
            directoryReads.reset();
            inventoryPayloadBytes = 0;
        },
        metrics() {
            return {
                phaseCountersAvailable: true,
                ...sourceReadMetrics(inputs, sourceReads),
                eliminationParsedBytes: 0,
                integrityParsedBytes: 0,
                manifestReadAmplification: manifestReads.amplification(),
                directoryReadAmplification: directoryReads.amplification(),
                inventoryPayloadBytes,
                repeatedResolutionFraction: 0,
                repeatedEliminationFraction: 0,
                repeatedIntegrityFraction: 0
            };
        }
    };
}
