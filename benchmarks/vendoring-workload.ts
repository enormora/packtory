import path from 'node:path';
import { match } from 'ts-pattern';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { PerformanceWorkload } from './performance-benchmark-types.ts';

export const vendoringCases = [
    'wide',
    'deep',
    'diamond',
    'cycle',
    'many-small-files',
    'large-payloads',
    'nested-versions',
    'repeated-outputs'
] as const;
export type VendoringCase = (typeof vendoringCases)[number];
export type VendoringWorkload = {
    readonly initialDependencyNames: readonly string[];
    readonly manifestPaths: ReadonlySet<string>;
    readonly files: ReadonlyMap<string, Buffer>;
};
type DependencyDefinition = {
    readonly folder: string;
    readonly manifest: Readonly<Record<string, unknown>>;
    readonly fileCount: number;
    readonly payloadBytes: number;
};
const diamondLeft = 1;
const diamondRight = 2;
const diamondLeaf = 3;
const largePayloadMultiplier = 32;
const smallFileCountMultiplier = 8;
const smallPayloadBytes = 64;
const binaryPayloadValue = 165;

function dependencyIndexes(index: number, count: number, shape: VendoringCase): readonly number[] {
    return match(shape)
        .with('cycle', function () {
            return [ (index + 1) % count ];
        })
        .with('deep', function () {
            return index + 1 < count ? [ index + 1 ] : [];
        })
        .with('diamond', function () {
            if (index === 0) {
                return [ diamondLeft, diamondRight ];
            }
            if ([ diamondLeft, diamondRight ].includes(index)) {
                return [ diamondLeaf ];
            }
            return index + 1 < count ? [ index + 1 ] : [];
        })
        .otherwise(function () {
            return [];
        });
}

function dependencyName(index: number): string {
    return `fixture-dependency-${index}`;
}

async function writeDependency(
    fileManager: FileManager,
    definition: DependencyDefinition
): Promise<ReadonlyMap<string, Buffer>> {
    const payload = Buffer.alloc(definition.payloadBytes, binaryPayloadValue);
    const files = new Map([
        [ path.join(definition.folder, 'package.json'), Buffer.from(JSON.stringify(definition.manifest)) ] as const,
        [ path.join(definition.folder, 'index.js'), Buffer.from('export const value = 42;\n') ] as const,
        ...Array.from({ length: definition.fileCount }, function (_value, index) {
            return [ path.join(definition.folder, 'assets', `payload-${index}.bin`), payload ] as const;
        })
    ]);
    for (const [ filePath, content ] of files) {
        await fileManager.writeBinaryFile(filePath, content);
    }
    return files;
}

function nestedVersions(rootDirectory: string): readonly DependencyDefinition[] {
    return [ 'fixture-left', 'fixture-right' ].flatMap(function (name, index) {
        const folder = path.join(rootDirectory, 'node_modules', name);
        return [
            {
                folder,
                manifest: { name, version: '1.0.0', dependencies: { 'fixture-shared': '*' } },
                fileCount: 1,
                payloadBytes: smallPayloadBytes
            },
            {
                folder: path.join(folder, 'node_modules', 'fixture-shared'),
                manifest: { name: 'fixture-shared', version: `${index + 1}.0.0`, dependencies: {} },
                fileCount: 1,
                payloadBytes: smallPayloadBytes
            }
        ];
    });
}

function graphPackages(
    rootDirectory: string,
    shape: VendoringCase,
    definition: PerformanceWorkload
): readonly DependencyDefinition[] {
    const fileCount = definition.filesPerDependency * (shape === 'many-small-files' ? smallFileCountMultiplier : 1);
    const payloadBytes = shape === 'many-small-files' ? smallPayloadBytes : definition.payloadBytes;
    return Array.from({ length: definition.dependencyCount }, function (_value, index) {
        const name = dependencyName(index);
        const dependencies = Object.fromEntries(
            dependencyIndexes(index, definition.dependencyCount, shape).map(function (dependency) {
                return [ dependencyName(dependency), '1.0.0' ];
            })
        );
        return {
            folder: path.join(rootDirectory, 'node_modules', name),
            manifest: { name, version: '1.0.0', type: 'module', exports: './index.js', dependencies },
            fileCount,
            payloadBytes: payloadBytes * (shape === 'large-payloads' ? largePayloadMultiplier : 1)
        };
    });
}

export async function createVendoringWorkload(
    fileManager: FileManager,
    rootDirectory: string,
    shape: VendoringCase,
    definition: PerformanceWorkload
): Promise<VendoringWorkload> {
    const packages = shape === 'nested-versions'
        ? nestedVersions(rootDirectory)
        : graphPackages(rootDirectory, shape, definition);
    const fileMaps = await Promise.all(packages.map(async function (dependency) {
        return writeDependency(fileManager, dependency);
    }));
    const initialDependencyNames = match(shape)
        .with('nested-versions', function () {
            return [ 'fixture-left', 'fixture-right' ];
        })
        .with('deep', 'diamond', 'cycle', function () {
            return [ dependencyName(0) ];
        })
        .otherwise(function () {
            return Array.from({ length: definition.dependencyCount }, function (_value, index) {
                return dependencyName(index);
            });
        });
    return {
        initialDependencyNames,
        manifestPaths: new Set(packages.map(function (dependency) {
            return path.join(dependency.folder, 'package.json');
        })),
        files: new Map(fileMaps.flatMap(function (files) {
            return Array.from(files);
        }))
    };
}
