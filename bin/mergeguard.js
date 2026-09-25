#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).then(
  (code) => process.exit(code ?? 0),
  (error) => {
    console.error(`mergeguard: ${error?.message || error}`);
    if (process.env.MERGEGUARD_DEBUG === "1" && error?.stack) console.error(error.stack);
    process.exit(2);
  },
);
