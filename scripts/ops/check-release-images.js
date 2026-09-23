#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const yaml = require('js-yaml');

const COMPOSE_PATH = 'infra/compose/docker-compose.production.example.yml';
const APP_IMAGES = {
  next: '${ACRES_CLIENT_IMAGE:?inject pinned client image digest}',
  api: '${ACRES_SERVER_IMAGE:?inject pinned server image digest}',
  worker: '${ACRES_SERVER_IMAGE:?inject pinned server image digest}',
};
const EXPORTER_IMAGE = 'ghcr.io/prometheus-community/postgres-exporter@sha256:ac5ec343104fae0e2d84a27bb8d69b38430a11910c5382cad85d478d2bab713e';

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

function validateImageReference(value, name) {
  if (typeof value !== 'string' || !IMAGE_REFERENCE.test(value)) {
    throw new Error(`${name} must be a registry/path@sha256 reference with 64 lowercase hex digits and no tag`);
  }
  const registry = value.slice(0, value.indexOf('/'));
  const hostname = registry.split(':')[0];
  if (hostname.length > 253 || hostname.split('.').some((label) => label.length > 63)) {
    throw new Error(`${name} has an invalid registry hostname`);
  }
  const port = registry.match(/:([0-9]+)$/)?.[1];
  if (port && Number(port) > 65535) {
    throw new Error(`${name} has an invalid registry port`);
  }
}

function validateComposeImages(compose) {
  for (const [serviceName, expectedImage] of Object.entries(APP_IMAGES)) {
    const service = compose?.services?.[serviceName];
    if (!service || Object.prototype.hasOwnProperty.call(service, 'build') || service.image !== expectedImage) {
      throw new Error(`${serviceName} must use its required release image input without a build`);
    }
  }
  const exporter = compose?.services?.['postgres-exporter'];
  if (!exporter || Object.prototype.hasOwnProperty.call(exporter, 'build') ||
      exporter.image !== EXPORTER_IMAGE) {
    throw new Error('postgres-exporter must use its required pinned image input without a build');
  }
}

function checkReleaseImages(compose, env) {
  validateComposeImages(compose);
  validateImageReference(env.ACRES_CLIENT_IMAGE, 'ACRES_CLIENT_IMAGE');
  validateImageReference(env.ACRES_SERVER_IMAGE, 'ACRES_SERVER_IMAGE');
}

if (require.main === module) {
  try {
    const compose = yaml.load(fs.readFileSync(COMPOSE_PATH, 'utf8'));
    checkReleaseImages(compose, process.env);
    process.stdout.write('release image check passed\n');
  } catch (error) {
    // YAML/parser errors can contain operator-supplied text. Never print them.
    process.stderr.write(`release image check failed: ${error instanceof Error && /^(next|api|worker|ACRES_)/.test(error.message) ? error.message : 'invalid production Compose template'}\n`);
    process.exitCode = 1;
  }
}

module.exports = { validateImageReference, validateComposeImages, checkReleaseImages };
