/**
 * Ordered Maestro journey builder for `scripts/maestro-test.sh --flow-list`.
 * Reads a list file (one YAML path per line, relative to the list file) and
 * writes one parent flow that runs the listed flows in order.
 *
 * CLI: node scripts/maestro-journey.cjs LIST_FILE DEST_DIR [maestro args...]
 * Writes DEST_DIR/paths.txt (resolved child paths, for preflight) and
 * DEST_DIR/journey.yaml (the parent flow). Exits 2 with `error: …` on refusal.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseMaestroInvocation } = require('./maestro-fixture-guard.cjs');

const REFUSED_OPTION =
  /^(--(include-tags|exclude-tags|device|platform|shard[^=]*)(=|$)|-p$)/;

function assertOrderedArgs(args) {
  if (args.some(arg => REFUSED_OPTION.test(arg))) {
    throw new Error(
      'ordered journeys refuse tag filters, device/platform overrides and sharding',
    );
  }
  if (parseMaestroInvocation(args).paths.length) {
    throw new Error(
      '--flow-list cannot be combined with positional flow paths',
    );
  }
}

function readFlowList(listFile, nodeFs = fs) {
  const listPath = path.resolve(listFile);
  const flows = nodeFs
    .readFileSync(listPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => path.resolve(path.dirname(listPath), line));
  if (!flows.length) throw new Error('flow list is empty');
  if (new Set(flows).size !== flows.length) {
    throw new Error('duplicate flow list entry');
  }
  for (const flow of flows) {
    if (!/\.ya?ml$/.test(flow) || !nodeFs.statSync(flow).isFile()) {
      throw new Error('flow list entries must be existing YAML files');
    }
  }
  return flows;
}

function renderJourney(flows) {
  return (
    'appId: com.eten.fluent\nname: Ordered Fluent journey\n---\n' +
    flows.map(flow => '- runFlow: ' + JSON.stringify(flow)).join('\n') +
    '\n'
  );
}

function writeJourney({ listFile, destination, args = [] }, nodeFs = fs) {
  assertOrderedArgs(args);
  const flows = readFlowList(listFile, nodeFs);
  nodeFs.writeFileSync(
    path.join(destination, 'paths.txt'),
    flows.join('\n') + '\n',
  );
  nodeFs.writeFileSync(
    path.join(destination, 'journey.yaml'),
    renderJourney(flows),
  );
  return flows;
}

function main(argv = process.argv.slice(2)) {
  const [listFile, destination, ...args] = argv;
  try {
    writeJourney({ listFile, destination, args });
  } catch (error) {
    console.error('error: ' + error.message);
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  assertOrderedArgs,
  readFlowList,
  renderJourney,
  writeJourney,
  main,
};
