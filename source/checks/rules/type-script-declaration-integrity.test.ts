import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { checkPublishedPackage } from '../../test-libraries/check-fixtures.ts';
import {
    createDeclarationIntegritySummarizer,
    type DeclarationMode
} from './type-script-declaration-integrity.ts';
import type { DeclarationDiagnostic, DeclarationProject } from './type-script-declaration-project.ts';

type FakeProjectParts = {
    readonly modeLabel: string;
    readonly diagnostics: readonly DeclarationDiagnostic[];
    readonly specifiers: Readonly<Record<string, readonly string[]>>;
};

function fakeProject(parts: FakeProjectParts): DeclarationProject {
    return {
        modeLabel: parts.modeLabel,
        moduleSpecifiersOf(declarationPath) {
            return parts.specifiers[declarationPath] ?? [];
        },
        listDiagnostics() {
            return parts.diagnostics;
        }
    };
}

function diagnostic(declarationPath: string): DeclarationDiagnostic {
    return {
        declarationPath,
        line: 1,
        code: 2305,
        message: "Module '\"./internal.js\"' has no exported member 'Missing'."
    };
}

type SummarizeOptions = {
    readonly manifestContent: string;
    readonly files: Readonly<Record<string, string>>;
    readonly projects: readonly DeclarationProject[];
    readonly declarationMode: DeclarationMode;
};

function summarize(options: SummarizeOptions): readonly string[] {
    const summarizeDeclarationIntegrity = createDeclarationIntegritySummarizer({
        createDeclarationProjects: fake.returns(options.projects) as SinonSpy
    });

    return summarizeDeclarationIntegrity(
        'pkg',
        checkPublishedPackage('pkg', options.manifestContent, options.files),
        options.declarationMode
    );
}

const brokenIndexFiles = {
    'index.js': 'export const value = 1;\n',
    'index.d.ts': 'import { Missing } from "./internal.js";\n',
    'internal.d.ts': 'export declare const present: string;\n'
};

suite('type-script-declaration-integrity', function () {
    test('passes the manifest and every packaged file to the project factory', function () {
        const createDeclarationProjects = fake.returns([]);
        const summarizeDeclarationIntegrity = createDeclarationIntegritySummarizer({
            createDeclarationProjects: createDeclarationProjects as SinonSpy
        });

        summarizeDeclarationIntegrity(
            'pkg',
            checkPublishedPackage('pkg', '{"types":"./index.d.ts"}', { 'index.d.ts': 'export {};\n' }),
            'all'
        );

        assert.deepStrictEqual(createDeclarationProjects.args, [ [
            'pkg',
            [
                { filePath: 'package.json', content: '{"types":"./index.d.ts"}' },
                { filePath: 'index.d.ts', content: 'export {};\n' }
            ]
        ] ]);
    });

    test('reports a diagnostic per compiler mode with its mode label', function () {
        const issues = summarize({
            manifestContent: '{"types":"./index.d.ts"}',
            files: brokenIndexFiles,
            projects: [
                fakeProject({ modeLabel: 'node16-esm', diagnostics: [ diagnostic('index.d.ts') ], specifiers: {} }),
                fakeProject({ modeLabel: 'bundler', diagnostics: [ diagnostic('index.d.ts') ], specifiers: {} })
            ],
            declarationMode: 'all'
        });

        assert.deepStrictEqual(issues, [
            'Package "pkg" failed TypeScript integrity in node16-esm: index.d.ts:1 TS2305: ' +
            "Module '\"./internal.js\"' has no exported member 'Missing'.",
            'Package "pkg" failed TypeScript integrity in bundler: index.d.ts:1 TS2305: ' +
            "Module '\"./internal.js\"' has no exported member 'Missing'."
        ]);
    });

    test('reports the line and the code of a diagnostic', function () {
        const issues = summarize({
            manifestContent: '{"types":"./index.d.ts"}',
            files: brokenIndexFiles,
            projects: [
                fakeProject({
                    modeLabel: 'node16-esm',
                    diagnostics: [
                        { declarationPath: 'index.d.ts', line: 7, code: 2430, message: 'incompatible\n  details' }
                    ],
                    specifiers: {}
                })
            ],
            declarationMode: 'all'
        });

        assert.deepStrictEqual(issues, [
            'Package "pkg" failed TypeScript integrity in node16-esm: index.d.ts:7 TS2430: incompatible\n  details'
        ]);
    });

    test('ignores diagnostics of files the package does not ship as declarations', function () {
        const issues = summarize({
            manifestContent: '{"types":"./index.d.ts"}',
            files: brokenIndexFiles,
            projects: [
                fakeProject({
                    modeLabel: 'node16-esm',
                    diagnostics: [ diagnostic('../../typescript/lib/lib.es5.d.ts'), diagnostic('index.js') ],
                    specifiers: {}
                })
            ],
            declarationMode: 'all'
        });

        assert.deepStrictEqual(issues, []);
    });

    test('checks every packaged declaration in the "all" mode', function () {
        const issues = summarize({
            manifestContent: '{"types":"./index.d.ts"}',
            files: brokenIndexFiles,
            projects: [
                fakeProject({ modeLabel: 'node16-esm', diagnostics: [ diagnostic('internal.d.ts') ], specifiers: {} })
            ],
            declarationMode: 'all'
        });

        assert.deepStrictEqual(issues, [
            'Package "pkg" failed TypeScript integrity in node16-esm: internal.d.ts:1 TS2305: ' +
            "Module '\"./internal.js\"' has no exported member 'Missing'."
        ]);
    });

    test('ignores declarations that no export reaches in the "exports-graph" mode', function () {
        const issues = summarize({
            manifestContent: '{"types":"./index.d.ts"}',
            files: {
                'index.d.ts': 'export declare const value: number;\n',
                'private.d.ts': 'import { Missing } from "./internal.js";\n',
                'internal.d.ts': 'export declare const present: string;\n'
            },
            projects: [
                fakeProject({ modeLabel: 'node16-esm', diagnostics: [ diagnostic('private.d.ts') ], specifiers: {} })
            ],
            declarationMode: 'exports-graph'
        });

        assert.deepStrictEqual(issues, []);
    });

    test('checks declarations reachable from an export in the "exports-graph" mode', function () {
        const issues = summarize({
            manifestContent: '{"exports":{".":{"types":"./index.d.ts"}}}',
            files: {
                'index.d.ts': 'export * from "./reachable.js";\n',
                'reachable.d.ts': 'import { Missing } from "./internal.js";\n',
                'internal.d.ts': 'export declare const present: string;\n'
            },
            projects: [
                fakeProject({
                    modeLabel: 'node16-esm',
                    diagnostics: [ diagnostic('reachable.d.ts') ],
                    specifiers: { 'index.d.ts': [ './reachable.js' ] }
                })
            ],
            declarationMode: 'exports-graph'
        });

        assert.deepStrictEqual(issues, [
            'Package "pkg" failed TypeScript integrity in node16-esm: reachable.d.ts:1 TS2305: ' +
            "Module '\"./internal.js\"' has no exported member 'Missing'."
        ]);
    });
});
