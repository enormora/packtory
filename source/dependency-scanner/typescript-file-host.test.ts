import test from 'ava';
import { type SinonSpy, fake } from 'sinon';
import {
    createFileSystemAdapters,
    type FileSystemAdapters,
    type FileSystemAdaptersDependencies
} from './typescript-file-host.ts';

type Overrides = {
    fileExists?: SinonSpy;
    fileExistsSync?: SinonSpy;
    directoryExists?: SinonSpy;
    directoryExistsSync?: SinonSpy;
};

function fileSystemAdaptersFactory(overrides: Overrides): FileSystemAdapters {
    const {
        fileExists = fake(),
        fileExistsSync = fake(),
        directoryExists = fake(),
        directoryExistsSync = fake()
    } = overrides;
    const fakeDependencies = {
        fileSystemHost: { fileExists, fileExistsSync, directoryExistsSync, directoryExists }
    } as unknown as FileSystemAdaptersDependencies;

    return createFileSystemAdapters(fakeDependencies);
}

type WrappedFileHostMethodCallTestCase = {
    method: 'directoryExists' | 'directoryExistsSync' | 'fileExists' | 'fileExistsSync';
    adapter: 'fileSystemHostFilteringDeclarationFiles' | 'fileSystemHostWithoutFilter';
    pathToCheck: string;
    upstreamMethodReturnValue: boolean;
    expectedResult: boolean;
    expectedUpstreamCalls: unknown[];
};

const checkWrappedFileHostMethod = test.macro(async (t, testCase: WrappedFileHostMethodCallTestCase) => {
    const upstreamMethod = ['fileExists', 'directoryExists'].includes(testCase.method)
        ? fake.resolves(testCase.upstreamMethodReturnValue)
        : fake.returns(testCase.upstreamMethodReturnValue);

    const fileSystemAdapters = fileSystemAdaptersFactory({ [testCase.method]: upstreamMethod });
    const adapter = fileSystemAdapters[testCase.adapter];

    const result = await adapter[testCase.method](testCase.pathToCheck);

    t.is(result, testCase.expectedResult);
    t.deepEqual(upstreamMethod.args, testCase.expectedUpstreamCalls);
});

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists returns false when the file extension is .d.ts',
    checkWrappedFileHostMethod,
    {
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.ts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists returns false when the file extension is .d.cts',
    checkWrappedFileHostMethod,
    {
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.cts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists returns false when the file extension is .d.mts',
    checkWrappedFileHostMethod,
    {
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.mts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists returns the same value from the wrapped fileSystemHost when it is not a declaration file',
    checkWrappedFileHostMethod,
    {
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.txt',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/bar.txt']]
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync returns false when the file extension is .d.ts',
    checkWrappedFileHostMethod,
    {
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.ts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync returns false when the file extension is .d.cts',
    checkWrappedFileHostMethod,
    {
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.cts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync returns false when the file extension is .d.mts',
    checkWrappedFileHostMethod,
    {
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.mts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync returns the same value from the wrapped fileSystemHost when it is not a declaration file',
    checkWrappedFileHostMethod,
    {
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.txt',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/bar.txt']]
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExists returns false when the path contains the segments node_modules/@types/',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/@types/bar',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExists returns the same value from the wrapped fileSystemHost when it doesn’t contain a type-roots path segment',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/bar',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/node_modules/bar']]
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExistsSync returns false when the path contains the segments node_modules/@types',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/@types/bar',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExistsSync returns the same value from the wrapped fileSystemHost when it doesn’t contain a type-roots path segment',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/bar',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/node_modules/bar']]
    }
);

test(
    'fileSystemHostWithoutFilter.fileExists returns the same value from the wrapped fileSystemHost even when a declaration file is given',
    checkWrappedFileHostMethod,
    {
        method: 'fileExists',
        adapter: 'fileSystemHostWithoutFilter',
        pathToCheck: 'foo/bar.d.ts',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/bar.d.ts']]
    }
);

test(
    'fileSystemHostWithoutFilter.fileExistsSync returns the same value from the wrapped fileSystemHost even when a declaration file is given',
    checkWrappedFileHostMethod,
    {
        method: 'fileExistsSync',
        adapter: 'fileSystemHostWithoutFilter',
        pathToCheck: 'foo/bar.d.ts',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/bar.d.ts']]
    }
);

test(
    'fileSystemHostWithoutFilter.directoryExists returns the same value from the wrapped fileSystemHost even when a type-roots path is given',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExists',
        adapter: 'fileSystemHostWithoutFilter',
        pathToCheck: 'foo/node_modules/@types/bar',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/node_modules/@types/bar']]
    }
);

test(
    'fileSystemHostWithoutFilter.directoryExistsSync returns the same value from the wrapped fileSystemHost even when a type-roots path is given',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostWithoutFilter',
        pathToCheck: 'foo/node_modules/@types/bar',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/node_modules/@types/bar']]
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExists returns false when the path ends with the segments node_modules/@types',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/@types',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExists returns the same value from the wrapped fileSystemHost when the path contains node_modules/@types which is not the end of the segment',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',

        pathToCheck: 'foo/node_modules/@typesomething/foo',
        upstreamMethodReturnValue: true,
        expectedResult: true,

        expectedUpstreamCalls: [['foo/node_modules/@typesomething/foo']]
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExistsSync returns false when the path ends with the segments node_modules/@types',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/@types',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    }
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExistsSync returns the same value from the wrapped fileSystemHost when the path contains node_modules/@types which is not the end of the segment',
    checkWrappedFileHostMethod,
    {
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',

        pathToCheck: 'foo/node_modules/@typesomething/foo',
        upstreamMethodReturnValue: true,
        expectedResult: true,

        expectedUpstreamCalls: [['foo/node_modules/@typesomething/foo']]
    }
);
