'use strict';

/**
 * Validates the root vercel.json multi-service configuration for Acres.
 * Returns an array of error messages; empty when valid.
 *
 * @param {any} config Parsed vercel.json object
 * @returns {string[]} Validation errors
 */
function checkVercelConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['vercel.json must be a non-null object'];
  }

  if (typeof config.$schema !== 'string' || !config.$schema.includes('vercel.json')) {
    errors.push('vercel.json must declare a valid $schema');
  }

  const services = config.services;
  if (!services || typeof services !== 'object' || Array.isArray(services)) {
    errors.push('vercel.json must define a services object');
    return errors;
  }

  // Validate client service
  const client = services.client;
  if (!client || typeof client !== 'object') {
    errors.push('services.client must be defined');
  } else {
    if (client.root !== 'client') {
      errors.push('services.client.root must be "client"');
    }
    if (client.framework !== 'nextjs') {
      errors.push('services.client.framework must be "nextjs"');
    }
    if (!Array.isArray(client.bindings)) {
      errors.push('services.client.bindings must be an array');
    } else {
      const apiBinding = client.bindings.find(
        (b) => b.type === 'service' && b.service === 'api' && b.env === 'ACRES_API_ORIGIN',
      );
      if (!apiBinding) {
        errors.push(
          'services.client.bindings must declare service binding to "api" exposing "ACRES_API_ORIGIN"',
        );
      } else if (apiBinding.format !== 'url') {
        errors.push('services.client.bindings API binding format must be "url"');
      }
    }
  }

  // Validate api service
  const api = services.api;
  if (!api || typeof api !== 'object') {
    errors.push('services.api must be defined');
  } else {
    if (api.root !== 'server') {
      errors.push('services.api.root must be "server"');
    }
    if (api.framework !== 'nestjs') {
      errors.push('services.api.framework must be "nestjs"');
    }

    const functions = api.functions;
    if (!functions || typeof functions !== 'object') {
      errors.push('services.api.functions must be defined');
    } else {
      for (const [fnPath, fnConfig] of Object.entries(functions)) {
        if (!fnConfig || typeof fnConfig !== 'object') {
          errors.push(`services.api.functions["${fnPath}"] must be an object`);
          continue;
        }
        if (!Array.isArray(fnConfig.regions) || !fnConfig.regions.includes('iad1')) {
          errors.push(`services.api.functions["${fnPath}"] must pin region "iad1"`);
        }
      }

      // main.ts
      const main = functions['src/main.ts'];
      if (!main) {
        errors.push('services.api.functions must configure "src/main.ts"');
      } else if (main.maxDuration !== 30 && main.maxDuration !== 60) {
        errors.push('services.api.functions["src/main.ts"].maxDuration must be 30 or 60');
      }

      // jobs.function.ts
      const jobs = functions['src/vercel/jobs.function.ts'];
      if (!jobs) {
        errors.push('services.api.functions must configure "src/vercel/jobs.function.ts"');
      } else {
        if (jobs.maxDuration !== 60) {
          errors.push(
            'services.api.functions["src/vercel/jobs.function.ts"].maxDuration must be 60',
          );
        }
        if (!Array.isArray(jobs.experimentalTriggers)) {
          errors.push(
            'services.api.functions["src/vercel/jobs.function.ts"].experimentalTriggers must be an array',
          );
        } else {
          const queueTrigger = jobs.experimentalTriggers.find(
            (t) => t.type === 'queue/v2beta' && t.topic === 'acres-jobs',
          );
          if (!queueTrigger) {
            errors.push(
              'services.api.functions["src/vercel/jobs.function.ts"] must have queue/v2beta trigger for topic "acres-jobs"',
            );
          } else {
            if (queueTrigger.maxDeliveries !== undefined) {
              errors.push(
                'services.api.functions["src/vercel/jobs.function.ts"] must omit maxDeliveries to let durable ledger govern retries',
              );
            }
            if (typeof queueTrigger.retryAfterSeconds !== 'number' || queueTrigger.retryAfterSeconds <= 0) {
              errors.push(
                'services.api.functions["src/vercel/jobs.function.ts"] queue trigger must declare positive retryAfterSeconds',
              );
            }
          }
        }
      }

      // dispatch.function.ts
      const dispatch = functions['src/vercel/dispatch.function.ts'];
      if (!dispatch) {
        errors.push('services.api.functions must configure "src/vercel/dispatch.function.ts"');
      } else if (dispatch.maxDuration !== 60) {
        errors.push(
          'services.api.functions["src/vercel/dispatch.function.ts"].maxDuration must be 60',
        );
      }
    }
  }

  // Validate optional jobs service
  if (services.jobs) {
    const jobsSvc = services.jobs;
    if (typeof jobsSvc !== 'object') {
      errors.push('services.jobs must be an object');
    } else {
      if (jobsSvc.root !== 'server') {
        errors.push('services.jobs.root must be "server"');
      }
      if (jobsSvc.entrypoint !== 'src/vercel/jobs.function.ts') {
        errors.push('services.jobs.entrypoint must be "src/vercel/jobs.function.ts"');
      }
      const fn = jobsSvc.functions?.['src/vercel/jobs.function.ts'];
      if (!fn || typeof fn !== 'object') {
        errors.push('services.jobs.functions must configure "src/vercel/jobs.function.ts"');
      } else {
        if (!Array.isArray(fn.regions) || !fn.regions.includes('iad1')) {
          errors.push('services.jobs.functions["src/vercel/jobs.function.ts"] must pin region "iad1"');
        }
        if (fn.maxDuration !== 60) {
          errors.push('services.jobs.functions["src/vercel/jobs.function.ts"].maxDuration must be 60');
        }
        if (!Array.isArray(fn.experimentalTriggers)) {
          errors.push('services.jobs.functions["src/vercel/jobs.function.ts"].experimentalTriggers must be an array');
        } else {
          const trigger = fn.experimentalTriggers.find(
            (t) => t.type === 'queue/v2beta' && t.topic === 'acres-jobs',
          );
          if (!trigger) {
            errors.push('services.jobs.functions["src/vercel/jobs.function.ts"] must have queue/v2beta trigger for topic "acres-jobs"');
          } else {
            if (trigger.maxDeliveries !== undefined) {
              errors.push('services.jobs.functions["src/vercel/jobs.function.ts"] must omit maxDeliveries to let durable ledger govern retries');
            }
            if (typeof trigger.retryAfterSeconds !== 'number' || trigger.retryAfterSeconds <= 0) {
              errors.push('services.jobs.functions["src/vercel/jobs.function.ts"] queue trigger must declare positive retryAfterSeconds');
            }
          }
        }
      }
    }
  }

  // Validate crons
  if (!Array.isArray(config.crons)) {
    errors.push('vercel.json must declare crons array');
  } else {
    const cron = config.crons.find((c) => c.path === '/cron/dispatch');
    if (!cron) {
      errors.push('vercel.json crons must declare path "/cron/dispatch"');
    } else if (typeof cron.schedule !== 'string' || cron.schedule.trim().length === 0) {
      errors.push('vercel.json crons["/cron/dispatch"] must declare schedule');
    }
  }

  // Validate rewrites
  if (!Array.isArray(config.rewrites)) {
    errors.push('vercel.json must declare rewrites array');
  } else {
    const cronRewriteIndex = config.rewrites.findIndex((r) => r.source === '/cron/dispatch');
    const clientRewriteIndex = config.rewrites.findIndex((r) => r.source === '/(.*)');

    if (cronRewriteIndex === -1) {
      errors.push('vercel.json rewrites must declare rewrite for "/cron/dispatch"');
    } else {
      const dest = config.rewrites[cronRewriteIndex].destination;
      if (
        !dest ||
        dest.service !== 'api' ||
        dest.path !== '/src/vercel/dispatch.function.ts'
      ) {
        errors.push(
          'vercel.json rewrites "/cron/dispatch" destination must be { service: "api", path: "/src/vercel/dispatch.function.ts" }',
        );
      }
    }

    if (clientRewriteIndex === -1) {
      errors.push('vercel.json rewrites must declare rewrite for "/(.*)"');
    } else {
      const dest = config.rewrites[clientRewriteIndex].destination;
      if (!dest || dest.service !== 'client') {
        errors.push('vercel.json rewrites "/(.*)" destination must be { service: "client" }');
      }
    }

    if (
      cronRewriteIndex !== -1 &&
      clientRewriteIndex !== -1 &&
      cronRewriteIndex > clientRewriteIndex
    ) {
      errors.push('vercel.json rewrites "/cron/dispatch" must precede "/(.*)"');
    }
  }

  return errors;
}

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.resolve(__dirname, '../../vercel.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse vercel.json: ${err.message}`);
    process.exit(1);
  }
  const errors = checkVercelConfig(config);
  if (errors.length > 0) {
    console.error(`check-vercel-config failed with ${errors.length} error(s):`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
  console.log('vercel.json configuration valid');
}

module.exports = { checkVercelConfig };

