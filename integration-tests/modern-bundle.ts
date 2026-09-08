import path from 'node:path';
import { getModuleReferenceLiterals } from '../source/dependency-scanner/source-file-references.ts';
import type { ArtifactModuleReference } from '../source/resource-resolver/resolved-bundle.ts';
import { createProject } from '../source/test-libraries/typescript-project.ts';
import { serializePackageJson } from '../source/version-manager/manifest/serialize.ts';

type TransferableFile = {
    readonly inputFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
};

type ManifestFile = {
    readonly filePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
};

type BundleContentExpectation = {
    readonly directDependencies: ReadonlySet<string>;
    readonly fileDescription: TransferableFile;
    readonly moduleReferences?: readonly ArtifactModuleReference[] | undefined;
};
type LocalModuleReference = Extract<
    ArtifactModuleReference,
    { readonly type: 'generated-manifest' | 'local-asset' | 'local-code'; }
>;

type LegacyImplicitBundleExpectation = {
    readonly name: string;
    readonly packageJson: Readonly<Record<string, unknown>>;
    readonly manifestFile: ManifestFile;
    readonly mainFile: TransferableFile;
    readonly typesMainFile?: TransferableFile | undefined;
    readonly contents?: readonly BundleContentExpectation[] | undefined;
};

type ModernImplicitBundleExpectation = {
    readonly packageJson: Readonly<Record<string, unknown>>;
    readonly manifestFile: ManifestFile;
    readonly mainFile: TransferableFile;
    readonly roots: {
        readonly main: {
            readonly js: TransferableFile;
            readonly declarationFile?: TransferableFile | undefined;
        };
    };
    readonly surface: {
        readonly mode: 'implicit';
        readonly defaultModuleRoot: 'main';
    };
    readonly exportsField: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly typesMainFile?: TransferableFile | undefined;
};

type ModernBundleExpectation<TExpected extends LegacyImplicitBundleExpectation> = {
    readonly name: TExpected['name'];
    readonly mainFile: TExpected['mainFile'];
    readonly packageJson: ModernImplicitBundleExpectation['packageJson'];
    readonly manifestFile: ModernImplicitBundleExpectation['manifestFile'];
    readonly roots: ModernImplicitBundleExpectation['roots'];
    readonly surface: ModernImplicitBundleExpectation['surface'];
    readonly exportsField: ModernImplicitBundleExpectation['exportsField'];
    readonly typesMainFile?: ModernImplicitBundleExpectation['typesMainFile'];
};

function omitLegacyPackageFields(packageJson: Readonly<Record<string, unknown>>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(packageJson).filter(function ([ key ]) {
            return key !== 'main' && key !== 'types';
        })
    );
}

const codeTargetPattern = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/u;

function externalPackageName(specifier: string, importerTargetFilePath: string): string {
    if (specifier.startsWith('@')) {
        const [ scope, packageName ] = specifier.split('/', 2);
        return `${scope}/${packageName}`;
    }
    if (importerTargetFilePath.endsWith('.d.ts')) {
        return `@types/${specifier}`;
    }
    return specifier.split('/', 1)[0] ?? specifier;
}

function localReferenceType(
    targetFilePath: string
): LocalModuleReference['type'] {
    if (targetFilePath === 'package.json') {
        return 'generated-manifest';
    }
    return codeTargetPattern.test(targetFilePath) ? 'local-code' : 'local-asset';
}

function localTargetFilePath(importerTargetFilePath: string, specifier: string): string {
    const unresolved = path.posix.isAbsolute(specifier)
        ? specifier.slice(1)
        : path.posix.join(path.posix.dirname(importerTargetFilePath), specifier);
    const resolved = path.posix.normalize(unresolved);
    if (importerTargetFilePath.endsWith('.d.ts') && resolved.endsWith('.js')) {
        return resolved.replace(/\.js$/u, '.d.ts');
    }
    return path.posix.extname(resolved) === '' ? `${resolved}.js` : resolved;
}

function moduleReference(importerTargetFilePath: string, specifier: string): ArtifactModuleReference | undefined {
    if (specifier.startsWith('node:')) {
        return undefined;
    }
    if (specifier.startsWith('.') || path.posix.isAbsolute(specifier)) {
        const targetFilePath = localTargetFilePath(importerTargetFilePath, specifier);
        return {
            type: localReferenceType(targetFilePath),
            sourceSpecifier: specifier,
            emittedSpecifier: specifier,
            targetFilePath
        };
    }
    return {
        type: 'external-package',
        packageName: externalPackageName(specifier, importerTargetFilePath),
        sourceSpecifier: specifier,
        emittedSpecifier: specifier
    };
}

function inferredModuleReferences(resource: BundleContentExpectation): readonly ArtifactModuleReference[] {
    if (!codeTargetPattern.test(resource.fileDescription.targetFilePath)) {
        return [];
    }
    const project = createProject({
        withFiles: [
            { filePath: resource.fileDescription.inputFilePath, content: resource.fileDescription.content }
        ]
    });
    const sourceFile = project.getSourceFileOrThrow(resource.fileDescription.inputFilePath);
    return getModuleReferenceLiterals(sourceFile).flatMap(function (literal) {
        if (literal.getLiteralValue().startsWith('#')) {
            return [];
        }
        const reference = moduleReference(resource.fileDescription.targetFilePath, literal.getLiteralValue());
        return reference === undefined ? [] : [ reference ];
    });
}

function targetFilePathByInputFilePath(
    contents: readonly BundleContentExpectation[]
): ReadonlyMap<string, string> {
    return new Map(contents.map(function (resource) {
        return [ resource.fileDescription.inputFilePath, resource.fileDescription.targetFilePath ];
    }));
}

function normalizeDirectDependencies(
    dependencies: ReadonlySet<string>,
    targetByInputPath: ReadonlyMap<string, string>
): ReadonlySet<string> {
    return new Set(Array.from(dependencies, function (dependency) {
        return targetByInputPath.get(dependency) ?? dependency;
    }));
}

function normalizeContents(contents: readonly BundleContentExpectation[]): readonly BundleContentExpectation[] {
    const targetByInputPath = targetFilePathByInputFilePath(contents);
    return contents.map(function (resource) {
        return {
            ...resource,
            directDependencies: normalizeDirectDependencies(resource.directDependencies, targetByInputPath),
            moduleReferences: resource.moduleReferences ?? inferredModuleReferences(resource)
        };
    });
}

export function asImplicitExportsBundle<TExpected extends LegacyImplicitBundleExpectation>(
    expected: TExpected
): ModernBundleExpectation<TExpected> {
    const { packageJson, manifestFile, mainFile, typesMainFile, contents, ...rest } = expected;
    const exportsField = {
        '.': {
            import: `./${mainFile.targetFilePath}`,
            ...typesMainFile === undefined ? {} : { types: `./${typesMainFile.targetFilePath}` }
        }
    };
    const modernPackageJson = {
        ...omitLegacyPackageFields(packageJson),
        exports: exportsField
    };

    const result = {
        ...rest,
        ...contents === undefined ? {} : { contents: normalizeContents(contents) },
        packageJson: modernPackageJson,
        manifestFile: {
            ...manifestFile,
            content: serializePackageJson(modernPackageJson)
        },
        mainFile,
        ...typesMainFile === undefined ? {} : { typesMainFile },
        roots: {
            main: {
                js: mainFile,
                declarationFile: typesMainFile
            }
        },
        surface: {
            mode: 'implicit' as const,
            defaultModuleRoot: 'main' as const
        },
        exportsField
    };

    return result;
}
