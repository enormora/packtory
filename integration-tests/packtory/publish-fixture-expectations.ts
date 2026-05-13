import { serializePackageJson } from '../../source/version-manager/manifest/serialize.ts';

export const expectedFirstPackageVersion = {
    version: '0.0.1',
    files: [
        {
            isExecutable: false,
            content: serializePackageJson({
                exports: {
                    '.': {
                        import: './entry1.js',
                        types: './entry1.d.ts'
                    },
                    './qux.js': {
                        import: './qux.js'
                    }
                },
                name: 'first',
                sideEffects: false,
                type: 'module',
                version: '0.0.1'
            }),
            filePath: 'package/package.json'
        },
        {
            isExecutable: false,
            content: "import { qux } from './qux.js';\n//# sourceMappingURL=entry1.js.map\n",
            filePath: 'package/entry1.js'
        },
        {
            isExecutable: false,
            content: "export const qux = 'qux';\n//# sourceMappingURL=qux.js.map\n",
            filePath: 'package/qux.js'
        },
        {
            isExecutable: false,
            content: "export declare const foo: import('./foo.js').Foo;\n",
            filePath: 'package/entry1.d.ts'
        },
        {
            isExecutable: false,
            content: "import { Baz } from './baz.js';\nexport type Foo = string;\n",
            filePath: 'package/foo.d.ts'
        },
        {
            isExecutable: false,
            content: 'export type Baz = number;\n',
            filePath: 'package/baz.d.ts'
        }
    ]
} as const;

export const expectedSecondPackageFirstRunVersion = {
    version: '0.0.1',
    files: [
        {
            isExecutable: false,
            content: serializePackageJson({
                dependencies: {
                    first: '0.0.1'
                },
                exports: {
                    '.': {
                        import: './entry2.js',
                        types: './entry2.d.ts'
                    }
                },
                name: 'second',
                sideEffects: false,
                type: 'module',
                version: '0.0.1'
            }),
            filePath: 'package/package.json'
        },
        {
            isExecutable: false,
            content: "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
            filePath: 'package/entry2.js'
        },
        {
            isExecutable: false,
            content:
                "import { qux } from 'first/qux.js';\nexport const bar = 'bar';\n//# sourceMappingURL=bar.js.map\n",
            filePath: 'package/bar.js'
        },
        {
            isExecutable: false,
            content: "export declare const foo: import('first/foo.d.ts').Foo;\n",
            filePath: 'package/entry2.d.ts'
        }
    ]
} as const;

export const expectedSecondPackageSecondRunVersion = {
    version: '0.0.2',
    files: [
        {
            isExecutable: false,
            content: serializePackageJson({
                dependencies: {
                    first: '0.0.1'
                },
                exports: {
                    '.': {
                        import: './entry2.js',
                        types: './entry2.d.ts'
                    }
                },
                name: 'second',
                sideEffects: false,
                type: 'module',
                version: '0.0.2'
            }),
            filePath: 'package/package.json'
        },
        {
            isExecutable: false,
            content: "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
            filePath: 'package/entry2.js'
        },
        {
            isExecutable: false,
            content:
                "import { qux } from 'first/qux.js';\nexport const bar = 'bar-changed';\n//# sourceMappingURL=bar.js.map\n",
            filePath: 'package/bar.js'
        },
        {
            isExecutable: false,
            content: "export declare const foo: import('first/foo.d.ts').Foo;\n",
            filePath: 'package/entry2.d.ts'
        }
    ]
} as const;
