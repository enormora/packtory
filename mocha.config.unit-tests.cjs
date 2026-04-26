const baseConfig = require('./mocha.config.base.cjs');

module.exports = {
    ...baseConfig,
    spec: ['./source/**/*.test.ts'],
    timeout: 2000
};
