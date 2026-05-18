import { baseConfig } from '@enormora/eslint-config-base';
import { mochaConfig } from '@enormora/eslint-config-mocha';
import { typescriptConfig } from '@enormora/eslint-config-typescript';
import { nodeConfig, nodeConfigFileConfig, nodeEntryPointFileConfig } from '@enormora/eslint-config-node';

export default [
    {
        ignores: ['target/**/*', 'integration-tests/fixtures/**/*']
    },
    baseConfig,
    nodeConfig,
    {
        ...typescriptConfig,
        files: ['**/*.ts']
    },
    {
        ...mochaConfig,
        files: ['**/*.test.ts', '**/*.property.ts', 'integration-tests/**/*.ts'],
        rules: {
            ...mochaConfig.rules,
            // mirrors upcoming @enormora/eslint-config-mocha default; remove once that release lands
            'mocha/no-setup-in-describe': 'off'
        }
    },
    {
        ...nodeConfigFileConfig,
        files: [
            'dependency-cruiser.config.js',
            'eslint.config.js',
            'mocha.config.base.cjs',
            'mocha.config.unit-tests.cjs',
            'mocha.config.integration-tests.cjs',
            'mocha.config.property-tests.cjs',
            'packtory.config.js'
        ]
    },
    {
        files: [
            'mocha.config.base.cjs',
            'mocha.config.unit-tests.cjs',
            'mocha.config.integration-tests.cjs',
            'mocha.config.property-tests.cjs'
        ],
        rules: {
            'import/no-commonjs': 'off',
            'import/extensions': 'off',
            'no-undef': 'off'
        }
    },
    {
        files: ['packtory.config.js'],
        rules: {
            'node/no-process-env': 'off'
        }
    },
    {
        ...nodeEntryPointFileConfig,
        files: ['source/packages/**/*.entry-point.ts', 'source/packages/**/*.composition.ts']
    },
    {
        files: ['**/*.ts'],
        rules: {
            '@stylistic/operator-linebreak': [
                'error',
                'after',
                { overrides: { '?': 'before', ':': 'before', '|': 'before' } }
            ],
            '@typescript-eslint/no-extra-parens': 'off',
            '@typescript-eslint/no-magic-numbers': [
                'error',
                {
                    ignoreEnums: false,
                    ignoreNumericLiteralTypes: true,
                    ignoreReadonlyClassProperties: false,
                    ignoreTypeIndexes: false,
                    ignoreDefaultValues: true,
                    ignoreArrayIndexes: false,
                    detectObjects: false,
                    enforceConst: false,
                    ignoreClassFieldInitialValues: false,
                    ignore: [-1, 0, 1]
                }
            ],
            'max-lines-per-function': 'off',
            'import/extensions': 'off',
            // re-enable once https://github.com/eslint-functional/eslint-plugin-functional/issues/733 is fixed
            'functional/prefer-immutable-types': 'off',
            // re-enable once https://github.com/eslint-functional/eslint-plugin-functional/issues/733 is fixed
            'functional/type-declaration-immutability': 'off'
        }
    },
    {
        files: ['**/*.test.ts', '**/*.property.ts', 'source/test-libraries/**/*.ts'],
        rules: {
            '@typescript-eslint/no-magic-numbers': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/strict-boolean-expressions': 'off',
            'arrow-body-style': 'off',
            complexity: 'off',
            'id-length': 'off',
            'max-lines': 'off',
            'max-statements': 'off',
            'sonarjs/different-types-comparison': 'off',
            'sonarjs/function-return-type': 'off',
            'sonarjs/no-alphabetical-sort': 'off',
            'unicorn/no-array-reverse': 'off',
            'unicorn/no-array-sort': 'off'
        }
    },
    {
        files: ['**/*.property.ts'],
        rules: {
            '@typescript-eslint/naming-convention': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@stylistic/indent': 'off',
            'functional/prefer-tacit': 'off',
            'prefer-named-capture-group': 'off',
            'sonarjs/no-identical-functions': 'off',
            'unicorn/number-literal-case': 'off'
        }
    }
];
