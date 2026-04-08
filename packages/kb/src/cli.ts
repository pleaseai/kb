#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { initCommand } from './commands/init'

const main = defineCommand({
  meta: {
    name: 'kb',
    version: '0.0.0',
    description: 'Knowledge base CLI',
  },
  subCommands: {
    init: initCommand,
  },
})

void runMain(main)
