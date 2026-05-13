import assert from 'node:assert';
import { test } from 'mocha';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import {
    buildBinField,
    buildExportsField,
    getPublicModuleSpecifierForSourcePath,
    getPublicRootIds,
    resolvePublicModuleSourceFilePath
} from './modules.ts';

const malformedSurface = { mode: 'broken' };

function createJsFile(
    sourceFilePath: string,
    targetFilePath: string,
    options: { readonly content?: string; readonly isExecutable?: boolean } = {}
): {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
} {
    return {
        sourceFilePath,
        targetFilePath,
        content: options.content ?? '',
        isExecutable: options.isExecutable ?? false
    };
}

function createRoot(
    jsSourceFilePath: string,
    jsTargetFilePath: string,
    options: {
        readonly declarationSourceFilePath?: string;
        readonly declarationTargetFilePath?: string;
        readonly content?: string;
        readonly isExecutable?: boolean;
    } = {}
): {
    readonly js: {
        readonly sourceFilePath: string;
        readonly targetFilePath: string;
        readonly content: string;
        readonly isExecutable: boolean;
    };
    readonly declarationFile?: {
        readonly sourceFilePath: string;
        readonly targetFilePath: string;
        readonly content: string;
        readonly isExecutable: boolean;
    };
} {
    if (options.declarationSourceFilePath === undefined) {
        return {
            js: createJsFile(jsSourceFilePath, jsTargetFilePath, options)
        };
    }

    return {
        js: createJsFile(jsSourceFilePath, jsTargetFilePath, options),
        declarationFile: {
            sourceFilePath: options.declarationSourceFilePath,
            targetFilePath: options.declarationTargetFilePath ?? `${jsTargetFilePath}.d.ts`,
            content: '',
            isExecutable: false
        }
    };
}

test('getPublicRootIds() returns every implicit root and every explicit module/bin root', () => {
    const implicit = linkedBundle({
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            feature: createRoot('/src/feature.js', 'feature.js')
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
    const explicit = linkedBundle({
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            feature: createRoot('/src/feature.js', 'feature.js'),
            cli: createRoot('/src/cli.js', 'cli.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'feature', export: './feature' }
                ],
                bins: [{ root: 'cli', name: 'cli' }]
            }
        }
    });

    assert.deepStrictEqual(getPublicRootIds(implicit), new Set(['main', 'feature']));
    assert.deepStrictEqual(getPublicRootIds(explicit), new Set(['main', 'feature', 'cli']));
});

test('getPublicRootIds() excludes private roots from explicit packages', () => {
    const explicit = linkedBundle({
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            private: createRoot('/src/private.js', 'private.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'main', export: '.' }]
            }
        }
    });

    assert.deepStrictEqual(getPublicRootIds(explicit), new Set(['main']));
});

test('getPublicRootIds() tolerates explicit packages with only modules or only bins', () => {
    const modulesOnly = linkedBundle({
        roots: { main: createRoot('/src/index.js', 'index.js') },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'main', export: '.' }]
            }
        }
    });
    const binsOnly = linkedBundle({
        roots: { cli: createRoot('/src/cli.js', 'cli.js') },
        surface: {
            mode: 'explicit',
            packageInterface: {
                bins: [{ root: 'cli', name: 'cli' }]
            }
        }
    });

    assert.deepStrictEqual(getPublicRootIds(modulesOnly), new Set(['main']));
    assert.deepStrictEqual(getPublicRootIds(binsOnly), new Set(['cli']));
});

test('getPublicModuleSpecifierForSourcePath() resolves implicit roots, declarations, and surviving public files', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js', {
                declarationSourceFilePath: '/src/index.d.ts',
                declarationTargetFilePath: 'index.d.ts'
            }),
            helper: createRoot('/src/helper.js', 'helper.js', {
                declarationSourceFilePath: '/src/helper.d.ts',
                declarationTargetFilePath: 'helper.d.ts'
            })
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/index.d.ts', { targetFilePath: 'index.d.ts' }),
            analyzedBundleResource('/src/helper.js', { targetFilePath: 'helper.js' }),
            analyzedBundleResource('/src/helper.d.ts', { targetFilePath: 'helper.d.ts' }),
            analyzedBundleResource('/src/feature.js', { targetFilePath: 'feature.js' }),
            analyzedBundleResource('/src/feature.d.ts', { targetFilePath: 'feature.d.ts' }),
            analyzedBundleResource('/src/module.mjs', { targetFilePath: 'module.mjs' }),
            analyzedBundleResource('/src/module.d.mts', { targetFilePath: 'module.d.mts' }),
            analyzedBundleResource('/src/common.cjs', { targetFilePath: 'common.cjs' }),
            analyzedBundleResource('/src/common.d.cts', { targetFilePath: 'common.d.cts' })
        ],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/index.js'), 'package-a');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/index.d.ts'), 'package-a');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/helper.d.ts'), 'package-a/helper.js');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/feature.d.ts'), 'package-a/feature.d.ts');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/module.d.mts'), 'package-a/module.d.mts');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/common.d.cts'), 'package-a/common.d.cts');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/feature.js'), 'package-a/feature.js');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/missing.js'), undefined);
});

test('getPublicModuleSpecifierForSourcePath() preserves public declaration subpaths with varied basenames', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js')
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/long-module-name.mjs', { targetFilePath: 'long-module-name.mjs' }),
            analyzedBundleResource('/src/long-module-name.d.mts', { targetFilePath: 'long-module-name.d.mts' }),
            analyzedBundleResource('/src/x.cjs', { targetFilePath: 'x.cjs' }),
            analyzedBundleResource('/src/x.d.cts', { targetFilePath: 'x.d.cts' })
        ],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(
        getPublicModuleSpecifierForSourcePath(bundle, '/src/long-module-name.d.mts'),
        'package-a/long-module-name.d.mts'
    );
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/x.d.cts'), 'package-a/x.d.cts');
});

test('getPublicModuleSpecifierForSourcePath() does not reinterpret unsupported file types as declaration companions', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js')
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/notes.txt', { targetFilePath: 'notes.txt' }),
            analyzedBundleResource('/src/notes.cjs', { targetFilePath: 'notes.cjs' })
        ],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/notes.txt'), 'package-a/notes.txt');
});

test('getPublicModuleSpecifierForSourcePath() exposes declaration-only files using their declaration subpath', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js')
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/foo.d.ts', { targetFilePath: 'foo.d.ts' })
        ],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/foo.d.ts'), 'package-a/foo.d.ts');
});

test('getPublicModuleSpecifierForSourcePath() prefers the root export in explicit mode', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js', {
                declarationSourceFilePath: '/src/index.d.ts',
                declarationTargetFilePath: 'index.d.ts'
            }),
            feature: createRoot('/src/feature.js', 'feature.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: './index' },
                    { root: 'feature', export: './feature' },
                    { root: 'main', export: '.' }
                ]
            }
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/index.d.ts', { targetFilePath: 'index.d.ts' }),
            analyzedBundleResource('/src/feature.js', { targetFilePath: 'feature.js' })
        ]
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/index.js'), 'package-a');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/index.d.ts'), 'package-a');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/feature.js'), 'package-a/feature');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/other.js'), undefined);
});

test('getPublicModuleSpecifierForSourcePath() resolves explicit declaration roots even without runtime content', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js', {
                declarationSourceFilePath: '/src/index.d.ts',
                declarationTargetFilePath: 'index.d.ts'
            })
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'main', export: '.' }]
            }
        },
        contents: [analyzedBundleResource('/src/index.d.ts', { targetFilePath: 'index.d.ts' })]
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/index.d.ts'), 'package-a');
});

test('getPublicModuleSpecifierForSourcePath() promotes "." ahead of earlier non-dot explicit exports', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: './index' },
                    { root: 'main', export: '.' }
                ]
            }
        }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/index.js'), 'package-a');
});

test('getPublicModuleSpecifierForSourcePath() keeps "." selected when a later export references the same root', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'main', export: './later' }
                ]
            }
        }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/index.js'), 'package-a');
});

test('getPublicModuleSpecifierForSourcePath() prefers shorter explicit export keys and then declaration order', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            feature: createRoot('/src/feature.js', 'feature.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'feature', export: './feature-long' },
                    { root: 'feature', export: './a' },
                    { root: 'main', export: '.' }
                ]
            }
        }
    });
    const sameLengthBundle = linkedBundle({
        name: 'package-b',
        roots: {
            feature: createRoot('/src/feature.js', 'feature.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'feature', export: './aa' },
                    { root: 'feature', export: './bb' }
                ]
            }
        }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/feature.js'), 'package-a/a');
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(sameLengthBundle, '/src/feature.js'), 'package-b/aa');
});

test('getPublicModuleSpecifierForSourcePath() maps non-default declaration roots even without declaration content', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            helper: createRoot('/src/helper.js', 'helper.js', {
                declarationSourceFilePath: '/src/helper.d.ts',
                declarationTargetFilePath: 'helper.d.ts'
            })
        },
        contents: [analyzedBundleResource('/src/helper.js', { targetFilePath: 'helper.js' })],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/helper.d.ts'), 'package-a/helper.js');
});

test('getPublicModuleSpecifierForSourcePath() skips non-default roots without declarations before matching a later declaration root', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            feature: createRoot('/src/feature.js', 'feature.js'),
            helper: createRoot('/src/helper.js', 'helper.js', {
                declarationSourceFilePath: '/src/helper.d.ts',
                declarationTargetFilePath: 'helper.d.ts'
            })
        },
        contents: [analyzedBundleResource('/src/helper.js', { targetFilePath: 'helper.js' })],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/helper.d.ts'), 'package-a/helper.js');
});

test('getPublicModuleSpecifierForSourcePath() maps the default declaration root even without declaration content', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js', {
                declarationSourceFilePath: '/src/index.d.ts',
                declarationTargetFilePath: 'index.d.ts'
            })
        },
        contents: [analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' })],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/index.d.ts'), 'package-a');
});

test('getPublicModuleSpecifierForSourcePath() returns undefined for explicit packages without module exports', () => {
    const bundle = linkedBundle({
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                bins: [{ root: 'cli', name: 'package-a' }]
            }
        },
        contents: [analyzedBundleResource('/src/cli.js', { targetFilePath: 'cli.js' })]
    });

    assert.strictEqual(getPublicModuleSpecifierForSourcePath(bundle, '/src/cli.js'), undefined);
});

test('getPublicModuleSpecifierForSourcePath() throws when the package surface mode is malformed', () => {
    const bundle = linkedBundle({
        surface: malformedSurface as never
    });

    assert.throws(() => {
        getPublicModuleSpecifierForSourcePath(bundle, '/src/index.js');
    }, /^Error: Unexpected package surface mode$/u);
});

test('resolvePublicModuleSourceFilePath() resolves explicit and implicit public specifiers', () => {
    const explicitBundle = linkedBundle({
        name: 'package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            feature: createRoot('/src/feature.js', 'feature.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'feature', export: './feature' }
                ]
            }
        }
    });
    const implicitBundle = linkedBundle({
        name: 'package-b',
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            feature: createRoot('/src/feature.js', 'feature.js')
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/feature.js', { targetFilePath: 'feature.js' }),
            analyzedBundleResource('/src/private.js', { targetFilePath: 'private.js' })
        ],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(resolvePublicModuleSourceFilePath(explicitBundle, 'package-a'), '/src/index.js');
    assert.strictEqual(resolvePublicModuleSourceFilePath(explicitBundle, 'package-a/feature'), '/src/feature.js');
    assert.strictEqual(resolvePublicModuleSourceFilePath(explicitBundle, 'package-a/missing'), undefined);
    assert.strictEqual(resolvePublicModuleSourceFilePath(explicitBundle, 'other-package'), undefined);
    assert.strictEqual(resolvePublicModuleSourceFilePath(implicitBundle, 'package-b'), '/src/index.js');
    assert.strictEqual(resolvePublicModuleSourceFilePath(implicitBundle, 'package-b/private.js'), '/src/private.js');
    assert.strictEqual(resolvePublicModuleSourceFilePath(implicitBundle, 'other-package/private.js'), undefined);
});

test('resolvePublicModuleSourceFilePath() does not treat foreign package prefixes as explicit exports', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: {
            feature: createRoot('/src/feature.js', 'feature.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'feature', export: './feature' }]
            }
        }
    });

    assert.strictEqual(resolvePublicModuleSourceFilePath(bundle, 'othername/feature'), undefined);
});

test('resolvePublicModuleSourceFilePath() returns undefined for explicit packages without modules', () => {
    const bundle = linkedBundle({
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                bins: [{ root: 'cli', name: 'package-a' }]
            }
        }
    });

    assert.strictEqual(resolvePublicModuleSourceFilePath(bundle, 'package-a'), undefined);
    assert.strictEqual(resolvePublicModuleSourceFilePath(bundle, 'package-a/cli'), undefined);
});

test('resolvePublicModuleSourceFilePath() ignores malformed explicit module entries when the specifier is not public', () => {
    const malformedBundle = linkedBundle({
        name: 'package-a',
        roots: {
            feature: createRoot('/src/feature.js', 'feature.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'feature', export: undefined as never }]
            }
        }
    });

    assert.strictEqual(resolvePublicModuleSourceFilePath(malformedBundle, 'other-package'), undefined);
});

test('resolvePublicModuleSourceFilePath() ignores malformed implicit contents when the specifier is not public', () => {
    const malformedBundle = linkedBundle({
        name: 'package-b',
        roots: {
            main: createRoot('/src/index.js', 'index.js')
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/bogus.js', { targetFilePath: undefined as never })
        ],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.strictEqual(resolvePublicModuleSourceFilePath(malformedBundle, 'other-package/private.js'), undefined);
});

test('resolvePublicModuleSourceFilePath() throws when the package surface mode is malformed', () => {
    const bundle = linkedBundle({
        surface: malformedSurface as never
    });

    assert.throws(() => {
        resolvePublicModuleSourceFilePath(bundle, 'package-a');
    }, /^Error: Unexpected package surface mode$/u);
});

test('buildExportsField() maps explicit exports and omits missing declaration files', () => {
    const bundle = linkedBundle({
        roots: {
            main: createRoot('/src/index.js', 'index.js', {
                declarationSourceFilePath: '/src/index.d.ts',
                declarationTargetFilePath: 'index.d.ts'
            }),
            cli: createRoot('/src/cli.js', 'cli.js')
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'cli', export: './cli' }
                ]
            }
        }
    });

    assert.deepStrictEqual(buildExportsField(bundle, new Set()), {
        '.': {
            import: './index.js',
            types: './index.d.ts'
        },
        './cli': {
            import: './cli.js'
        }
    });
});

test('buildExportsField() throws when an explicit export references an unknown root', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: { main: createRoot('/src/index.js', 'index.js') },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'missing', export: '.' }]
            }
        }
    });

    assert.throws(() => {
        buildExportsField(bundle, new Set());
    }, /^Error: Package "package-a" references unknown root "missing"$/u);
});

test('buildExportsField() includes implicit roots and substitution-backed public modules', () => {
    const bundle = linkedBundle({
        roots: {
            main: createRoot('/src/index.js', 'index.js', {
                declarationSourceFilePath: '/src/index.d.ts',
                declarationTargetFilePath: 'index.d.ts'
            }),
            helper: createRoot('/src/helper.js', 'helper.js')
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/helper.js', { targetFilePath: 'helper.js' }),
            analyzedBundleResource('/src/public.js', { targetFilePath: 'public.js' })
        ],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.deepStrictEqual(buildExportsField(bundle, new Set(['/src/index.js', '/src/helper.js', '/src/public.js'])), {
        '.': {
            import: './index.js',
            types: './index.d.ts'
        },
        './helper.js': {
            import: './helper.js'
        },
        './public.js': {
            import: './public.js'
        }
    });
});

test('buildExportsField() skips declaration-only substitution modules for ts, mts, and cts targets', () => {
    const bundle = linkedBundle({
        roots: {
            main: createRoot('/src/index.js', 'index.js', {
                declarationSourceFilePath: '/src/index.d.ts',
                declarationTargetFilePath: 'index.d.ts'
            })
        },
        contents: [
            analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' }),
            analyzedBundleResource('/src/index.d.ts', { targetFilePath: 'index.d.ts' }),
            analyzedBundleResource('/src/public.js', { targetFilePath: 'public.js' }),
            analyzedBundleResource('/src/types-only.d.ts', { targetFilePath: 'types-only.d.ts' }),
            analyzedBundleResource('/src/types-only.d.mts', { targetFilePath: 'types-only.d.mts' }),
            analyzedBundleResource('/src/types-only.d.cts', { targetFilePath: 'types-only.d.cts' })
        ],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.deepStrictEqual(
        buildExportsField(
            bundle,
            new Set(['/src/public.js', '/src/types-only.d.ts', '/src/types-only.d.mts', '/src/types-only.d.cts'])
        ),
        {
            '.': {
                import: './index.js',
                types: './index.d.ts'
            },
            './public.js': {
                import: './public.js'
            }
        }
    );
});

test('buildExportsField() throws when a substitution-backed public module is missing from contents', () => {
    const bundle = linkedBundle({
        name: 'package-a',
        roots: { main: createRoot('/src/index.js', 'index.js') },
        contents: [analyzedBundleResource('/src/index.js', { targetFilePath: 'index.js' })],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });

    assert.throws(() => {
        buildExportsField(bundle, new Set(['/src/missing.js']));
    }, /^Error: Package "package-a" is missing content for "\/src\/missing\.js"$/u);
});

test('buildExportsField() throws when the package surface mode is malformed', () => {
    const bundle = linkedBundle({
        surface: malformedSurface as never
    });

    assert.throws(() => {
        buildExportsField(bundle, new Set());
    }, /^Error: Unexpected package surface mode$/u);
});

test('buildBinField() returns undefined for explicit packages without bins', () => {
    const bundle = linkedBundle({
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'main', export: '.' }]
            }
        }
    });

    assert.strictEqual(buildBinField(bundle), undefined);
});

test('buildBinField() maps explicit bins and validates shebang executables', () => {
    const valid = linkedBundle({
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                isExecutable: true
            })
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                bins: [{ root: 'cli', name: 'package-a' }]
            }
        }
    });
    const invalid = linkedBundle({
        name: 'package-a',
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: 'console.log("cli");\n',
                isExecutable: false
            })
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                bins: [{ root: 'cli', name: 'package-a' }]
            }
        }
    });

    assert.deepStrictEqual(buildBinField(valid), { 'package-a': './cli.js' });
    assert.throws(() => {
        buildBinField(invalid);
    }, /^Error: Package "package-a" bin "package-a" must point to a root with a shebang and executable bit$/u);
});

test('buildBinField() rejects roots that only have one of executable mode or shebang content', () => {
    const executableWithoutShebang = linkedBundle({
        name: 'package-a',
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: 'console.log("cli");\n',
                isExecutable: true
            })
        },
        surface: {
            mode: 'explicit',
            packageInterface: {
                bins: [{ root: 'cli', name: 'package-a' }]
            }
        }
    });
    const shebangWithoutExecutable = linkedBundle({
        name: 'package-a',
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                isExecutable: false
            })
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'cli' }
    });

    assert.throws(() => {
        buildBinField(executableWithoutShebang);
    }, /^Error: Package "package-a" bin "package-a" must point to a root with a shebang and executable bit$/u);
    assert.strictEqual(buildBinField(shebangWithoutExecutable), undefined);
});

test('buildBinField() infers implicit bins, skips non-executables, and rejects ambiguity', () => {
    const scopedSingleBin = linkedBundle({
        name: '@scope/package-a',
        roots: {
            main: createRoot('/src/index.js', 'index.js'),
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                isExecutable: true
            })
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
    const unscopedSingleBin = linkedBundle({
        name: 'package-a',
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                isExecutable: true
            })
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'cli' }
    });
    const noBin = linkedBundle({
        roots: { main: createRoot('/src/index.js', 'index.js') },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
    const ambiguous = linkedBundle({
        name: 'package-a',
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                isExecutable: true
            }),
            worker: createRoot('/src/worker.js', 'worker.js', {
                content: '#!/usr/bin/env node\nconsole.log("worker");\n',
                isExecutable: true
            })
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'cli' }
    });
    const malformedScopedName = linkedBundle({
        name: '@scope',
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                isExecutable: true
            })
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'cli' }
    });

    assert.deepStrictEqual(buildBinField(scopedSingleBin), { 'package-a': './cli.js' });
    assert.deepStrictEqual(buildBinField(unscopedSingleBin), { 'package-a': './cli.js' });
    assert.strictEqual(buildBinField(noBin), undefined);
    assert.deepStrictEqual(buildBinField(malformedScopedName), { '@scope': './cli.js' });
    assert.throws(() => {
        buildBinField(ambiguous);
    }, /^Error: Package "package-a" has multiple executable shebang roots; declare packageInterface\.bins explicitly$/u);
});

test('buildBinField() preserves names that merely contain an @scope-like substring', () => {
    const bundle = linkedBundle({
        name: 'prefix@scope/package-a',
        roots: {
            cli: createRoot('/src/cli.js', 'cli.js', {
                content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                isExecutable: true
            })
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'cli' }
    });

    assert.deepStrictEqual(buildBinField(bundle), { 'prefix@scope/package-a': './cli.js' });
});

test('buildBinField() throws when the package surface mode is malformed', () => {
    const bundle = linkedBundle({
        surface: malformedSurface as never
    });

    assert.throws(() => {
        buildBinField(bundle);
    }, /^Error: Unexpected package surface mode$/u);
});
