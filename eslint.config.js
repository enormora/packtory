import fileSystem from 'node:fs/promises';
import { baseConfig as baseConfiguration } from '@enormora/eslint-config-base';
import {
    mochaNodeAssertConfig as mochaNodeAssertConfiguration,
    testSupportConfig as testSupportConfiguration
} from '@enormora/eslint-config-mocha-node-assert';
import { typescriptConfig as typescriptConfiguration } from '@enormora/eslint-config-typescript';
import {
    nodeConfig as nodeConfiguration,
    nodeConfigFileConfig as nodeConfigurationFileConfiguration,
    nodeEntryPointFileConfig as nodeEntryPointFileConfiguration
} from '@enormora/eslint-config-node';

const packageManifestSchema = JSON.parse(
    await fileSystem.readFile(new URL('./schemas/package-manifest.schema.json', import.meta.url), { encoding: 'utf8' })
);

export default [
    {
        ignores: [ 'target/**/*', 'integration-tests/fixtures/**/*' ]
    },
    ...baseConfiguration,
    {
        ...nodeConfiguration,
        files: [ '**/*.{js,cjs,mjs,ts,cts,mts}' ]
    },
    {
        ...typescriptConfiguration,
        files: [ '**/*.ts' ]
    },
    {
        ...mochaNodeAssertConfiguration,
        files: [ '**/*.test.ts', '**/*.property.ts', 'integration-tests/**/*.ts' ]
    },
    {
        ...testSupportConfiguration,
        files: [ 'source/test-libraries/**/*.ts', '**/*test-support.ts' ]
    },
    {
        ...nodeConfigurationFileConfiguration,
        files: [
            'dependency-cruiser.config.js',
            'eslint.config.js',
            'packtory.config.js'
        ]
    },
    {
        ...nodeEntryPointFileConfiguration,
        files: [ 'source/packages/**/*.entry-point.ts', 'source/packages/**/*.composition.ts' ]
    },
    {
        files: [ 'package.json' ],
        rules: {
            'json-schema-validator/no-invalid': [
                'error',
                {
                    schemas: [
                        {
                            fileMatch: [ 'package.json' ],
                            schema: packageManifestSchema
                        }
                    ],
                    useSchemastoreCatalog: false
                }
            ]
        }
    }
];
