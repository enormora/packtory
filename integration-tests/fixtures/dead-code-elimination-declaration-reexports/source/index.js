import { keep } from "./barrel.js";
export function run(context) {
    return keep() + context.value.length;
}
