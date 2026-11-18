// `pnpm e2e:clean [--orphans]`: see support/clean.ts.
import { cleanGraph } from "./support/clean.ts";

cleanGraph(...process.argv.slice(2));
