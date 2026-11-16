import type { RootHookObject } from 'mocha';
import { restore } from 'sinon';

export const mochaHooks: RootHookObject = {
    afterEach() {
        restore();
    }
};
