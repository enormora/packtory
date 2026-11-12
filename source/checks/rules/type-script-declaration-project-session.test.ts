import assert from 'node:assert';
import { suite, test } from 'mocha';
import { InMemoryFileSystemHost, Project, type ProjectOptions } from 'ts-morph';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { checkPublishedPackage } from '../../test-libraries/check-fixtures.ts';
import {
    createDeclarationIntegritySummarizer,
    type DeclarationIntegritySummarizer
} from './type-script-declaration-integrity.ts';
import { createDeclarationProjectFactory, type DeclarationProjectsFactory } from './type-script-declaration-project.ts';

type ValidationFixture = {
    readonly summarize: DeclarationIntegritySummarizer;
    readonly createProjects: DeclarationProjectsFactory;
    readonly projectCount: () => number;
};

type ValidationPackages = {
    readonly broken: PublishedPackageWithManifest;
    readonly valid: PublishedPackageWithManifest;
    readonly packages: ReadonlyMap<string, PublishedPackageWithManifest>;
};

const manifest = '{"types":"./index.d.ts"}';

function validationFixture(): ValidationFixture {
    let projectCount = 0;
    const ObservedProject = new Proxy(Project, {
        construct(projectConstructor, [ options ]: readonly (Readonly<ProjectOptions> | undefined)[]): Project {
            projectCount += 1;
            const project: unknown = Reflect.construct(projectConstructor, [ {
                ...options,
                compilerOptions: { ...options?.compilerOptions, noLib: true, types: [] }
            } ]);
            assert.ok(project instanceof Project);
            return project;
        }
    });
    const createProjects = createDeclarationProjectFactory({
        Project: ObservedProject,
        fileSystemHost: new InMemoryFileSystemHost(),
        packageResolutionBaseFolder: '/repo'
    });
    return {
        createProjects,
        summarize: createDeclarationIntegritySummarizer({ createDeclarationProjects: createProjects }),
        projectCount() {
            return projectCount;
        }
    };
}

function validationPackages(): ValidationPackages {
    const broken = checkPublishedPackage('broken', manifest, { 'index.d.ts': 'export declare const value: Missing;' });
    const valid = checkPublishedPackage('valid', manifest, { 'index.d.ts': 'export declare const value: number;' });
    return { broken, valid, packages: new Map([ [ 'broken', broken ], [ 'valid', valid ] ]) };
}

function assertMissingType(issues: readonly string[], name: string): void {
    assert.strictEqual(issues.length, 2);
    assert.ok(issues.every(function (issue) {
        return issue.includes('TS2304') && issue.includes(name);
    }));
}

suite('declaration project sessions', function () {
    test('prefers the package being checked over an older resolution entry', function () {
        const { summarize } = validationFixture();
        const { valid } = validationPackages();
        const changed = checkPublishedPackage('valid', manifest, {
            'index.d.ts': 'export declare const value: Changed;'
        });
        const packages = new Map([ [ 'valid', valid ] ]);
        assertMissingType(summarize('valid', changed, 'all', packages), 'Changed');
        assert.deepStrictEqual(summarize('valid', valid, 'all', packages), []);
        assertMissingType(summarize('valid', changed, 'all', packages), 'Changed');
    });

    test('does not share projects across package names that reuse the same file list', function () {
        const { createProjects } = validationFixture();
        const files = [
            { filePath: 'package.json', content: manifest },
            { filePath: 'index.d.ts', content: 'export declare const value: import("different").Missing;' }
        ];
        const packages = [ { packageName: 'original', packageFiles: files } ];
        for (const project of createProjects('different', files, packages)) {
            assert.ok(
                project.listDiagnostics().some(function (diagnostic) {
                    return diagnostic.code === 2694;
                })
            );
        }
        for (const project of createProjects('original', files, packages)) {
            assert.ok(
                project.listDiagnostics().some(function (diagnostic) {
                    return diagnostic.code === 2307;
                })
            );
        }
    });

    test('shares both compiler modes and keeps package diagnostics separate', function () {
        const { summarize, projectCount } = validationFixture();
        const { broken, valid, packages } = validationPackages();
        assertMissingType(summarize('broken', broken, 'all', packages), 'Missing');
        assert.deepStrictEqual(summarize('valid', valid, 'all', packages), []);
        assert.strictEqual(projectCount(), 2);
    });

    test('refreshes compiler projects for changed packages', function () {
        const { summarize, projectCount } = validationFixture();
        const { valid } = validationPackages();
        assert.deepStrictEqual(summarize('valid', valid, 'all', new Map([ [ 'valid', valid ] ])), []);
        const changed = checkPublishedPackage('valid', manifest, {
            'index.d.ts': 'export declare const value: Changed;'
        });
        assertMissingType(summarize('valid', changed, 'all', new Map([ [ 'valid', changed ] ])), 'Changed');
        assert.strictEqual(projectCount(), 4);
    });
});
