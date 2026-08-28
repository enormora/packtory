import { baseSharedConfig } from './base-shared.js';

const baseRuleConfig = {
    plugins: {
        ...baseSharedConfig.plugins
    },
    rules: {
        ...baseSharedConfig.rules
    }
};

export const producerConfig = [ baseRuleConfig ];

export function api() {
    return producerConfig[0].rules['example/basic-rule'];
}
