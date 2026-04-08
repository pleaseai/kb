#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "kb",
    version: "0.0.0",
    description: "Knowledge base CLI",
  },
  subCommands: {},
});

void runMain(main);
