const baseConfig = require('./mocha.config.base.cjs');

module.exports = {
    ...baseConfig,
    spec: ['./source/**/*.property.ts'],
    timeout: 5000
};
