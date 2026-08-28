import { baseSharedConfig } from '../pkg-producer/base-shared.js';

export const consumerConfig = {
    plugins: {
        ...baseSharedConfig.plugins
    },
    rules: {
        ...baseSharedConfig.rules
    }
};
