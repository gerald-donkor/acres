#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const COMPOSE_PATH = 'infra/compose/docker-compose.production.example.yml';
const APP_IMAGES = {
  next: '${ACRES_CLIENT_IMAGE:?inject pinned client image digest}',
  api: '${ACRES_SERVER_IMAGE:?inject pinned server image digest}',
  worker: '${ACRES_SERVER_IMAGE:?inject pinned server image digest}',
};
const EXPORTER_IMAGE =
  'ghcr.io/prometheus-community/postgres-exporter@sha256:ac5ec343104fae0e2d84a27bb8d69b38430a11910c5382cad85d478d2bab713e';

// A deliberately narrow subset of Docker's distribution/reference grammar:
// an explicit DNS registry (or host:port), lowercase repository components,
// and a lowercase SHA-256 digest. Tags, even alongside a digest, are excluded.
// Docker permits wider reference forms, but these make promotion ambiguous.
const HOST_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const REGISTRY = `(?:${HOST_LABEL}(?:\\.${HOST_LABEL})+|${HOST_LABEL}:[1-9][0-9]{0,4}|${HOST_LABEL}(?:\\.${HOST_LABEL})+:[1-9][0-9]{0,4})`;
const REPOSITORY_PART = '[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*';
const IMAGE_REFERENCE = new RegExp(
  `^${REGISTRY}/(?:${REPOSITORY_PART}/)*${REPOSITORY_PART}@sha256:[a-f0-9]{64}$`,
);

function isMapping(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}

function validateImageReference(value, name) {
  const label = typeof name === 'string' && name.trim() ? name.trim() : 'image';
  if (typeof value !== 'string' || !IMAGE_REFERENCE.test(value)) {
    throw new Error(
      `${label} must be a registry/path@sha256 reference with 64 lowercase hex digits and no tag`,
    );
  }
  const registry = value.slice(0, value.indexOf('/'));
  const hostname = registry.split(':')[0];
  if (
    hostname.length > 253 ||
    hostname.split('.').some((part) => part.length > 63)
  ) {
    throw new Error(`${label} has an invalid registry hostname`);
  }
  const port = registry.match(/:([0-9]+)$/)?.[1];
  if (port && Number(port) > 65535) {
    throw new Error(`${label} has an invalid registry port`);
  }
}

function validateComposeImagesErrors(compose) {
  if (!isMapping(compose)) {
    return ['compose must be an object'];
  }
  if (!isMapping(compose.services)) {
    return ['compose services must be an object'];
  }

  const errors = [];
  for (const [serviceName, expectedImage] of Object.entries(APP_IMAGES)) {
    const service = compose.services[serviceName];
    if (
      !isMapping(service) ||
      Object.hasOwn(service, 'build') ||
      service.image !== expectedImage
    ) {
      errors.push(
        `${serviceName} must use its required release image input without a build`,
      );
    }
  }

  const exporter = compose.services['postgres-exporter'];
  if (
    !isMapping(exporter) ||
    Object.hasOwn(exporter, 'build') ||
    exporter.image !== EXPORTER_IMAGE
  ) {
    errors.push(
      'postgres-exporter must use its required pinned image input without a build',
    );
  }

  return [...new Set(errors)];
}

function validateComposeImages(compose) {
  const errors = validateComposeImagesErrors(compose);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
}

function isObjectRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkReleaseImagesErrors(compose, env) {
  const errors = [];
  errors.push(...validateComposeImagesErrors(compose));

  if (!isObjectRecord(env)) {
    errors.push('env must be an object');
    return [...new Set(errors)];
  }

  try {
    validateImageReference(env.ACRES_CLIENT_IMAGE, 'ACRES_CLIENT_IMAGE');
  } catch (error) {
    errors.push(error.message);
  }

  try {
    validateImageReference(env.ACRES_SERVER_IMAGE, 'ACRES_SERVER_IMAGE');
  } catch (error) {
    errors.push(error.message);
  }

  return [...new Set(errors)];
}

function checkReleaseImages(compose, env) {
  validateComposeImages(compose);
  if (!isObjectRecord(env)) {
    throw new Error('env must be an object');
  }
  validateImageReference(env.ACRES_CLIENT_IMAGE, 'ACRES_CLIENT_IMAGE');
  validateImageReference(env.ACRES_SERVER_IMAGE, 'ACRES_SERVER_IMAGE');
}

class ReleaseImagesUsageError extends Error {}

function parseCliArguments(argv = process.argv.slice(2), cwd = process.cwd()) {
  if (typeof cwd !== 'string' || !cwd.trim()) {
    throw new ReleaseImagesUsageError('cwd requires a non-empty path');
  }
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== 'string')) {
    throw new ReleaseImagesUsageError('arguments must be an array of strings');
  }

  let override;
  let showHelp = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      showHelp = true;
      continue;
    }
    if (arg === '--cwd' || arg.startsWith('--cwd=')) {
      if (override !== undefined) {
        throw new ReleaseImagesUsageError('cwd may be specified only once');
      }
      override = arg === '--cwd' ? argv[++index] : arg.slice(6);
      if (
        typeof override !== 'string' ||
        !override.trim() ||
        (arg === '--cwd' && override.startsWith('-'))
      ) {
        throw new ReleaseImagesUsageError(
          'cwd requires a non-empty directory path',
        );
      }
      continue;
    }
    throw new ReleaseImagesUsageError(
      `unsupported option or positional argument: ${arg}`,
    );
  }

  return {
    showHelp,
    cwd: path.resolve(cwd, override === undefined ? '.' : override),
  };
}

function main(
  argv = process.argv,
  io = { log: console.log, error: console.error },
  options = {},
) {
  let parsed;
  try {
    parsed = parseCliArguments(argv.slice(2), options.cwd || process.cwd());
  } catch (error) {
    if (!(error instanceof ReleaseImagesUsageError)) throw error;
    io.error(`release image usage error: ${error.message}`);
    io.error(
      'Usage: node scripts/ops/check-release-images.js [--help | -h] [--cwd <path> | --cwd=<path>]',
    );
    if (options.exitOnError !== false) process.exit(1);
    return 1;
  }

  if (parsed.showHelp) {
    io.log(
      'Usage: node scripts/ops/check-release-images.js [--help | -h] [--cwd <path> | --cwd=<path>]',
    );
    return 0;
  }

  const composePath = path.resolve(parsed.cwd, COMPOSE_PATH);
  let compose;
  try {
    compose = yaml.load(fs.readFileSync(composePath, 'utf8'));
  } catch (_err) {
    io.error(
      `release image check failed: unable to read or parse ${COMPOSE_PATH}`,
    );
    if (options.exitOnError !== false) process.exit(1);
    return 1;
  }

  const env = options.env !== undefined ? options.env : process.env;

  try {
    checkReleaseImages(compose, env);
  } catch (error) {
    const isKnownSafe =
      error instanceof Error &&
      /^(next|api|worker|postgres-exporter|ACRES_|compose|env)/.test(
        error.message,
      );
    const message = isKnownSafe
      ? error.message
      : 'invalid production Compose template';
    io.error(`release image check failed: ${message}`);
    if (options.exitOnError !== false) process.exit(1);
    return 1;
  }

  io.log('release image check passed');
  return 0;
}

if (require.main === module) {
  main();
}

module.exports = {
  APP_IMAGES,
  EXPORTER_IMAGE,
  COMPOSE_PATH,
  ReleaseImagesUsageError,
  isMapping,
  isObjectRecord,
  validateImageReference,
  validateComposeImages,
  validateComposeImagesErrors,
  checkReleaseImages,
  checkReleaseImagesErrors,
  parseCliArguments,
  main,
};
