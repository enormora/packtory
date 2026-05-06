const configFiles = [
    '^dependency-cruiser\\.config\\.js$',
    '^eslint\\.config\\.js$',
    '^mocha\\.config\\..*\\.cjs$',
    '^packtory\\.config\\.js$'
];

const entryPointFiles = ['^source/.+/.+\\.entry-point\\.ts$'];

const testFiles = ['\\.(test|property|type-test)\\.ts$', '^integration-tests/'];
const testLibraryFiles = ['^source/test-libraries/'];
const excludedFiles = ['^(\\./)?integration-tests/fixtures/', '^(\\./)?target/'];

const ignoreFromOrphans = [...configFiles, ...entryPointFiles, ...testFiles];

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'error',
            from: {},
            to: {
                circular: true
            }
        },
        {
            name: 'no-orphans',
            severity: 'error',
            from: {
                orphan: true,
                pathNot: ignoreFromOrphans
            },
            to: {}
        },
        {
            name: 'no-internal-orphans',
            severity: 'error',
            from: {
                pathNot: []
            },
            module: {
                numberOfDependentsLessThan: 1,
                pathNot: ignoreFromOrphans
            }
        },
        {
            name: 'no-internal-but-tested-orphans',
            severity: 'error',
            from: {
                pathNot: [...testFiles, ...testLibraryFiles]
            },
            module: {
                numberOfDependentsLessThan: 1,
                pathNot: [
                    ...ignoreFromOrphans,
                    ...testLibraryFiles,
                    '.*(?<!\\.(ts|js))$',
                    '^node_modules/',
                    ...excludedFiles
                ]
            }
        },
        {
            name: 'no-deprecated-npm',
            severity: 'error',
            from: {},
            to: {
                dependencyTypes: ['deprecated']
            }
        },
        {
            name: 'no-duplicate-dep-types',
            severity: 'error',
            from: {},
            to: {
                dependencyTypes: ['npm'],
                dependencyTypesNot: ['type-only'],
                moreThanOneDependencyType: true
            }
        },
        {
            name: 'not-to-dev-dep',
            severity: 'error',
            from: {
                path: '^source/',
                pathNot: [...testFiles, ...testLibraryFiles]
            },
            to: {
                dependencyTypes: ['npm-dev'],
                moreThanOneDependencyType: false,
                pathNot: ['^node_modules/@types/', '\\.d\\.ts$']
            }
        },
        {
            name: 'no-non-package-json',
            severity: 'error',
            from: {},
            to: {
                dependencyTypes: ['npm-no-pkg', 'npm-unknown']
            }
        },
        {
            name: 'not-test-file-import',
            severity: 'error',
            from: {
                pathNot: testFiles
            },
            to: {
                path: testFiles
            }
        }
    ],
    options: {
        doNotFollow: {
            path: 'node_modules|target/',
            dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg']
        },
        exclude: {
            path: excludedFiles
        },
        moduleSystems: ['cjs', 'es6', 'tsd'],
        tsPreCompilationDeps: true,
        tsConfig: {
            fileName: 'tsconfig.json'
        },
        preserveSymlinks: false,
        combinedDependencies: true,
        reporterOptions: {
            dot: {
                collapsePattern: 'node_modules/[^/]+'
            }
        }
    }
};
