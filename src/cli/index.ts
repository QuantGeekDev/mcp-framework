#!/usr/bin/env node
import { Command } from 'commander';
import { createProject } from './project/create.js';
import { addTool } from './project/add-tool.js';
import { addPrompt } from './project/add-prompt.js';
import { addResource } from './project/add-resource.js';
import { buildFramework } from './framework/build.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program.name('mcp').description('CLI for managing MCP server projects').version('0.2.2');

program.command('build').description('Build the MCP project').action(buildFramework);

program
  .command('create')
  .description('Create a new MCP server project')
  .argument('[name]', 'project name')
  .option('--http', 'use HTTP transport instead of default stdio')
  .option('--cors', 'enable CORS with wildcard (*) access')
  .option('--port <number>', 'specify HTTP port (only valid with --http)', (val) =>
    parseInt(val, 10)
  )
  .option('--no-install', 'skip npm install and build steps')
  .option('--no-example', 'skip creating example tool')
  .action(createProject);

program
  .command('add')
  .description('Add a new component to your MCP server')
  .addCommand(
    new Command('tool')
      .description('Add a new tool')
      .argument('[name]', 'tool name')
      .action(addTool)
  )
  .addCommand(
    new Command('prompt')
      .description('Add a new prompt')
      .argument('[name]', 'prompt name')
      .action(addPrompt)
  )
  .addCommand(
    new Command('resource')
      .description('Add a new resource')
      .argument('[name]', 'resource name')
      .action(addResource)
  );

program.addCommand(validateCommand);

program.parse();
