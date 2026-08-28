import { plugin } from './plugin.js';

const unusedConfig = {
    rules: {
        unused: 'off'
    }
};

export const sharedConfig = {
    plugins: {
        example: plugin
    },
    rules: {
        'example/basic-rule': 'error'
    }
};
