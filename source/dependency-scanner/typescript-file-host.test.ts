import assert from 'node:assert';
import { test, type AsyncFunc } from 'mocha';
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
    readFile?: SinonSpy;
    readFileSync?: SinonSpy;
};

function fileSystemAdaptersFactory(overrides: Overrides): FileSystemAdapters {
    const {
        fileExists = fake(),
        fileExistsSync = fake(),
        directoryExists = fake(),
        directoryExistsSync = fake(),
        readFile = fake(),
        readFileSync = fake()
    } = overrides;
    const fakeDependencies = {
        fileSystemHost: { fileExists, fileExistsSync, directoryExistsSync, directoryExists, readFile, readFileSync }
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

function checkWrappedFileHostMethod(testCase: WrappedFileHostMethodCallTestCase): AsyncFunc {
    return async () => {
        const upstreamMethod = ['fileExists', 'directoryExists'].includes(testCase.method)
            ? fake.resolves(testCase.upstreamMethodReturnValue)
            : fake.returns(testCase.upstreamMethodReturnValue);

        const fileSystemAdapters = fileSystemAdaptersFactory({ [testCase.method]: upstreamMethod });
        const adapter = fileSystemAdapters[testCase.adapter];

        const result = await adapter[testCase.method](testCase.pathToCheck);

        assert.strictEqual(result, testCase.expectedResult);
        assert.deepStrictEqual(upstreamMethod.args, testCase.expectedUpstreamCalls);
    };
}

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists returns false when the file extension is .d.ts',
    checkWrappedFileHostMethod({
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.ts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists returns false when the file extension is .d.cts',
    checkWrappedFileHostMethod({
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.cts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists returns false when the file extension is .d.mts',
    checkWrappedFileHostMethod({
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.mts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists treats declaration file extensions case-insensitively',
    checkWrappedFileHostMethod({
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/BAR.D.TS',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExists returns the same value from the wrapped fileSystemHost when it is not a declaration file',
    checkWrappedFileHostMethod({
        method: 'fileExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.txt',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/bar.txt']]
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync returns false when the file extension is .d.ts',
    checkWrappedFileHostMethod({
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.ts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync returns false when the file extension is .d.cts',
    checkWrappedFileHostMethod({
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.cts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync returns false when the file extension is .d.mts',
    checkWrappedFileHostMethod({
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.d.mts',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync treats declaration file extensions case-insensitively',
    checkWrappedFileHostMethod({
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/BAR.D.MTS',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.fileExistsSync returns the same value from the wrapped fileSystemHost when it is not a declaration file',
    checkWrappedFileHostMethod({
        method: 'fileExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/bar.txt',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/bar.txt']]
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExists returns false when the path contains the segments node_modules/@types/',
    checkWrappedFileHostMethod({
        method: 'directoryExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/@types/bar',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExists returns the same value from the wrapped fileSystemHost when it doesn’t contain a type-roots path segment',
    checkWrappedFileHostMethod({
        method: 'directoryExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/bar',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/node_modules/bar']]
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExistsSync returns false when the path contains the segments node_modules/@types',
    checkWrappedFileHostMethod({
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/@types/bar',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExistsSync returns the same value from the wrapped fileSystemHost when it doesn’t contain a type-roots path segment',
    checkWrappedFileHostMethod({
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/bar',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/node_modules/bar']]
    })
);

test(
    'fileSystemHostWithoutFilter.fileExists returns the same value from the wrapped fileSystemHost even when a declaration file is given',
    checkWrappedFileHostMethod({
        method: 'fileExists',
        adapter: 'fileSystemHostWithoutFilter',
        pathToCheck: 'foo/bar.d.ts',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/bar.d.ts']]
    })
);

test(
    'fileSystemHostWithoutFilter.fileExistsSync returns the same value from the wrapped fileSystemHost even when a declaration file is given',
    checkWrappedFileHostMethod({
        method: 'fileExistsSync',
        adapter: 'fileSystemHostWithoutFilter',
        pathToCheck: 'foo/bar.d.ts',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/bar.d.ts']]
    })
);

test('throws when fileExistsSync is not a function', () => {
    try {
        createFileSystemAdapters({
            fileSystemHost: {
                fileExists: fake(),
                fileExistsSync: true,
                directoryExists: fake(),
                directoryExistsSync: fake()
            } as unknown as FileSystemAdaptersDependencies['fileSystemHost']
        });
        assert.fail('Expected createFileSystemAdapters() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Expected fileExistsSync to be a function');
    }
});

test('throws when directoryExistsSync does not return a boolean', () => {
    const fileSystemAdapters = fileSystemAdaptersFactory({
        directoryExistsSync: fake.returns('invalid')
    });

    try {
        // eslint-disable-next-line node/no-sync -- this test intentionally exercises the synchronous ts-morph host contract
        fileSystemAdapters.fileSystemHostFilteringDeclarationFiles.directoryExistsSync('foo/node_modules/bar');
        assert.fail('Expected directoryExistsSync() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Expected directoryExistsSync to return a boolean');
    }
});

test(
    'fileSystemHostWithoutFilter.directoryExists returns the same value from the wrapped fileSystemHost even when a type-roots path is given',
    checkWrappedFileHostMethod({
        method: 'directoryExists',
        adapter: 'fileSystemHostWithoutFilter',
        pathToCheck: 'foo/node_modules/@types/bar',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/node_modules/@types/bar']]
    })
);

test(
    'fileSystemHostWithoutFilter.directoryExistsSync returns the same value from the wrapped fileSystemHost even when a type-roots path is given',
    checkWrappedFileHostMethod({
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostWithoutFilter',
        pathToCheck: 'foo/node_modules/@types/bar',
        upstreamMethodReturnValue: true,
        expectedResult: true,
        expectedUpstreamCalls: [['foo/node_modules/@types/bar']]
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExists returns false when the path ends with the segments node_modules/@types',
    checkWrappedFileHostMethod({
        method: 'directoryExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/@types',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExists returns the same value from the wrapped fileSystemHost when the path contains node_modules/@types which is not the end of the segment',
    checkWrappedFileHostMethod({
        method: 'directoryExists',
        adapter: 'fileSystemHostFilteringDeclarationFiles',

        pathToCheck: 'foo/node_modules/@typesomething/foo',
        upstreamMethodReturnValue: true,
        expectedResult: true,

        expectedUpstreamCalls: [['foo/node_modules/@typesomething/foo']]
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExistsSync returns false when the path ends with the segments node_modules/@types',
    checkWrappedFileHostMethod({
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',
        pathToCheck: 'foo/node_modules/@types',
        upstreamMethodReturnValue: true,
        expectedResult: false,
        expectedUpstreamCalls: []
    })
);

test(
    'fileSystemHostFilteringDeclarationFiles.directoryExistsSync returns the same value from the wrapped fileSystemHost when the path contains node_modules/@types which is not the end of the segment',
    checkWrappedFileHostMethod({
        method: 'directoryExistsSync',
        adapter: 'fileSystemHostFilteringDeclarationFiles',

        pathToCheck: 'foo/node_modules/@typesomething/foo',
        upstreamMethodReturnValue: true,
        expectedResult: true,

        expectedUpstreamCalls: [['foo/node_modules/@typesomething/foo']]
    })
);

test('withVirtualPackageJson() makes the configured package.json path exist even when the wrapped host says it does not', async () => {
    const fileSystemAdapters = fileSystemAdaptersFactory({
        fileExists: fake.resolves(false),
        fileExistsSync: fake.returns(false)
    });
    const virtualHost = fileSystemAdapters.withVirtualPackageJson(
        fileSystemAdapters.fileSystemHostWithoutFilter,
        '/repo/src',
        { type: 'module', imports: { '#foo': './foo.js' } }
    );

    assert.strictEqual(await virtualHost.fileExists('/repo/src/package.json'), true);
    // eslint-disable-next-line node/no-sync -- ts-morph hosts require sync methods
    assert.strictEqual(virtualHost.fileExistsSync('/repo/src/package.json'), true);
});

test('withVirtualPackageJson() returns the serialized mainPackageJson for reads of the virtual manifest', async () => {
    const readFile = fake.resolves('from-disk');
    const readFileSync = fake.returns('from-disk-sync');
    const fileSystemAdapters = fileSystemAdaptersFactory({ readFile, readFileSync });
    const mainPackageJson = { type: 'module' as const, imports: { '#foo': './foo.js' } };
    const virtualHost = fileSystemAdapters.withVirtualPackageJson(
        fileSystemAdapters.fileSystemHostWithoutFilter,
        '/repo/src',
        mainPackageJson
    );

    assert.strictEqual(
        await virtualHost.readFile('/repo/src/package.json'),
        JSON.stringify(mainPackageJson, null, 2)
    );
    // eslint-disable-next-line node/no-sync -- ts-morph hosts require sync methods
    assert.strictEqual(virtualHost.readFileSync('/repo/src/package.json'), JSON.stringify(mainPackageJson, null, 2));
    assert.strictEqual(readFile.callCount, 0);
    assert.strictEqual(readFileSync.callCount, 0);
});

test('withVirtualPackageJson() delegates reads for non-package.json paths to the wrapped host', async () => {
    const readFile = fake.resolves('from-disk');
    const readFileSync = fake.returns('from-disk-sync');
    const fileSystemAdapters = fileSystemAdaptersFactory({ readFile, readFileSync });
    const virtualHost = fileSystemAdapters.withVirtualPackageJson(
        fileSystemAdapters.fileSystemHostWithoutFilter,
        '/repo/src',
        { type: 'module' }
    );

    assert.strictEqual(await virtualHost.readFile('/repo/src/foo.js'), 'from-disk');
    // eslint-disable-next-line node/no-sync -- ts-morph hosts require sync methods
    assert.strictEqual(virtualHost.readFileSync('/repo/src/foo.js'), 'from-disk-sync');
    assert.deepStrictEqual(readFile.args, [['/repo/src/foo.js', undefined]]);
    assert.deepStrictEqual(readFileSync.args, [['/repo/src/foo.js']]);
});
