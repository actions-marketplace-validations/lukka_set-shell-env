// Copyright (c) 2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as execiface from '@actions/exec/lib/interfaces'
import { delimiter } from 'path'

export const actionName = 'set-shell-env';
export const shellInput = 'shell';
export const argsInput = 'args';
export const filterInput = 'filter';

const excludedEnvVars: string[] = [shellInput, argsInput, filterInput, "path"];

interface EnvVarMap { [key: string]: string };

function parseEnv(data: string): EnvVarMap {
  const map: EnvVarMap = {};
  const regex = {
    param: /^\s*([^=]+?)\s*=\s*(.*?)\s*$/,
  };
  const lines = data.split(/[\r\n]+/);
  for (const line of lines) {
    if (regex.param.test(line)) {
      const match = line.match(regex.param);
      if (match) {
        map[match[1]] = match[2];
      }
    }
  }

  return map;
}

function dumpEnvironment(): void {
  core.debug("dumpEnvironment()<<");
  for (const name in process.env) {
    core.debug(`${name}='${process.env[name]}'`);
  }
  core.debug("dumpEnvironment()>>");
}


// Skip action inputs environment variables, and PATH as well.
function isExcluded(varName: string): boolean {
  return (excludedEnvVars.includes(varName.toLowerCase()))
}
export async function main(): Promise<void> {
  try {
    const shell = core.getInput(shellInput, { required: false }) || "bash";
    const args = core.getInput(argsInput, { required: false }) || "-c env";
    const filterExpression = core.getInput(filterInput);
    const filter: RegExp | undefined = filterExpression ? new RegExp(filterExpression) : undefined;

    console.log(`shell=${shell}, args=${args}, filter=${filter}`);
    dumpEnvironment();

    let stdout = "";
    let stderr = "";
    const options = {
      failOnStdErr: false,
      errStream: process.stdout,
      outStream: process.stdout,
      ignoreReturnCode: true,
      silent: false,
      windowsVerbatimArguments: false,
      env: process.env,
      listeners: {
        stdout: (data: Buffer): void => {
          stdout += data.toString();
        },
        stderr: (data: Buffer): void => {
          stderr += data.toString();
        }
      }
    } as execiface.ExecOptions;

    // Run the shell and get all the environment variables with the provided command.
    const exitCode = await exec.exec(shell, args.split(" "), options);
    if (exitCode !== 0) {
      throw new Error(`${stdout}\n\n${stderr}`);
    }

    // Parse the output.
    const map = parseEnv(stdout);

    // Set the environment variables that are included.
    for (const key in map) {
      let varName = key;
      if (key.startsWith("INPUT_")) {
        // Drop the INPUT_ prefix.
        varName = key.replace(/^INPUT_/, '');
        if (!isExcluded(varName)) {
          core.exportVariable(varName, map[key]);
          core.info(`Variable '${varName}' set to '${map[key]}'`);
        }
      } else {
        if (!isExcluded(varName)) {
          if (filter?.test(varName)) {
            core.exportVariable(varName, map[key]);
            core.info(`Variable '${varName}' set to '${map[key]}'`);
          }
        }
      }
    }

    dumpEnvironment();
    core.info(`${actionName} action execution succeeded`);
  }
  catch (err) {
    core.debug('Error: ' + err.toString());
    core.setFailed(`${actionName} action execution failed: ${err}`);
  }
}

