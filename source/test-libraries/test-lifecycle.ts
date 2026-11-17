import type { Context, RootHookObject } from 'mocha';
import { restore } from 'sinon';

export const mochaHooks: RootHookObject = {
    afterEach(this: Context): void {
        restore();
        // eslint-disable-next-line unicorn/no-this-outside-of-class, enormora-typescript/no-this-expressions -- Mocha supplies its hook context through this.
        const completedTest = this.currentTest;
        if (completedTest !== undefined) {
            delete completedTest.callback;
        }
    }
};
