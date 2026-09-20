#!/usr/bin/env node
// The CLI ships as TypeScript and runs through tsx, which is also what lets it import a user's
// sibyl.config.ts directly. (This used to require ../dist/index.js, which the build never produced.)
import { register } from 'tsx/esm/api';

register();
await import('../src/main.ts');
