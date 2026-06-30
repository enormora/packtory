import assert from 'node:assert';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    createVendorMaterializer,
    type MaterializedExternals,
    type VendorMaterializer,
    type VendorMaterializerFailure
} from './vendor-materializer.ts';

type ReadabilityResponse = { readonly value: { readonly isReadable: boolean; }; };
export type StringResponse = { readonly error: Error; } | { readonly value: string; };
type DirectoryEntriesResponse = {
    readonly value: readonly {
        readonly name: string;
        readonly isDirectory: boolean;
        readonly isSymbolicLink: boolean;
    }[];
};

export type FakeSetup = {
    readonly readabilities: readonly ReadabilityResponse[];
    readonly realPaths: readonly StringResponse[];
    readonly listings: readonly DirectoryEntriesResponse[];
    readonly fileReads: readonly StringResponse[];
};

export type MaterializeRequest = {
    readonly initialDependencyNames: readonly string[];
    readonly projectFolder: string;
};

export function setupFileManager(setup: FakeSetup): FakeFileManager {
    return createFakeFileManager({
        simulatedCheckReadabilityResponses: setup.readabilities,
        simulatedRealPathResponses: setup.realPaths,
        simulatedListDirectoryResponses: setup.listings,
        simulatedReadFileResponses: setup.fileReads
    });
}

export function expectOk(
    result: Awaited<ReturnType<VendorMaterializer['materializeExternals']>>
): MaterializedExternals {
    if (result.isErr) {
        assert.fail(`expected materializeExternals to succeed but it returned ${JSON.stringify(result.error)}`);
    }
    return result.value;
}

export function expectErr(
    result: Awaited<ReturnType<VendorMaterializer['materializeExternals']>>
): VendorMaterializerFailure {
    if (result.isOk) {
        assert.fail('expected materializeExternals to fail but it returned Ok');
    }
    return result.error;
}

export async function runWith(setup: FakeSetup, request: MaterializeRequest): Promise<MaterializedExternals> {
    const fileManager = setupFileManager(setup);
    const materializer = createVendorMaterializer({ fileManager });
    return expectOk(await materializer.materializeExternals(request));
}

export async function runExpectingFailure(
    setup: FakeSetup,
    request: MaterializeRequest
): Promise<VendorMaterializerFailure> {
    const fileManager = setupFileManager(setup);
    const materializer = createVendorMaterializer({ fileManager });
    return expectErr(await materializer.materializeExternals(request));
}

export function targetRelativePaths(result: MaterializedExternals): readonly string[] {
    return result.entries.map(function (entry) {
        return entry.targetRelativePath;
    });
}
