import { baseConfig } from '@enormora/eslint-config-base';
import { typescriptConfig } from '@enormora/eslint-config-typescript';
import { nodeConfig, nodeConfigFileConfig, nodeEntryPointFileConfig } from '@enormora/eslint-config-node';
import { avaConfig } from '@enormora/eslint-config-ava';

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
        ...avaConfig,
        files: ['**/*.test.ts', 'source/test-libraries/**/*.ts', 'integration-tests/**/*.ts']
    },
    {
        ...nodeConfigFileConfig,
        files: ['eslint.config.js', 'ava.config.js', 'ava.integration.config.js', 'packtory.config.js']
    },
    {
        ...nodeConfigFileConfig,
        files: ['packtory.config.js'],
        rules: {
            'node/no-process-env': 'off'
        }
    },
    {
        ...nodeEntryPointFileConfig,
        files: ['source/packages/**/*.entry-point.ts']
    },
    {
        files: ['**/*.ts'],
        rules: {
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
        files: ['**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-magic-numbers': 'off',
            'max-lines': 'off'
        }
    }
];
