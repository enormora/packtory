import { sharedConfig } from './shared.js';

export const baseSharedConfig = {
    plugins: {
        ...sharedConfig.plugins
    },
    rules: {
        ...sharedConfig.rules
    }
};
