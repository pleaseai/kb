#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { compileCommand } from './commands/compile'
import { ingestCommand } from './commands/ingest'
import { initCommand } from './commands/init'
import { statusCommand } from './commands/status'

const main = defineCommand({
  meta: {
    name: 'kb',
    version: '0.0.0',
    description: 'Knowledge base CLI',
  },
  subCommands: {
    init: initCommand,
    ingest: ingestCommand,
    status: statusCommand,
    compile: compileCommand,
  },
})

void runMain(main)
