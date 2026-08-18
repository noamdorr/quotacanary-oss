import pkg from "../../package.json"

// Stamped onto feedback submissions so a bug report says which build it came
// from. Read from package.json rather than an env var: self-hosters pin to
// release tags, and the tag and this number are the same thing.
export const APP_VERSION: string = pkg.version
