// Upstream LiftTrace version this fork is based on.
export const UPSTREAM_VERSION = 'v1.4.0';

// Fork: bump with every fork patch so you can tell builds apart. The
// "+fork.N" part is semver build metadata, which the update checker
// (lib/updates.js) ignores, so upstream releases still compare correctly.
// See FORK.md for what each fork patch contains.
export const FORK_VERSION = 'fork.4';

export const APP_VERSION = `${UPSTREAM_VERSION}+${FORK_VERSION}`;

// Where this build came from: "ios-12 · a1b2c3d" (GitHub Actions) or
// "local" (built on your own server). Set via VITE_FORK_BUILD at build time.
export const APP_BUILD = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FORK_BUILD) || 'local';
