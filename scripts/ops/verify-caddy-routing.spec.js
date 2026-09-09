const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {
  parseCaddyfile,
  evaluateRoute,
  verifyCaddyfile,
  DEFAULT_CADDYFILE_PATH,
} = require('./verify-caddy-routing');

test('verifyCaddyfile: parses reference Caddyfile.example cleanly with zero errors', () => {
  const result = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);

  assert.strictEqual(result.valid, true, `Verification failed with errors: ${result.errors.join('; ')}`);
  assert.strictEqual(result.errors.length, 0);
  assert.ok(result.parsedConfig);
  assert.strictEqual(result.parsedConfig.globalBlock.admin, 'off');
  assert.ok(result.parsedConfig.globalBlock.email);
  assert.strictEqual(result.evaluatedRoutes.length, 12);
  assert.ok(result.evaluatedRoutes.every((r) => r.passed));
});

test('evaluateRoute: accurately routes API endpoints to api:3001 with proxy headers', () => {
  const result = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);
  const apiPaths = [
    '/api/v1/auth/session',
    '/api/v1/organizations',
    '/api/v1/analytics/query',
    '/api/v1/reports/rep-123/export',
    '/graphql',
    '/health',
    '/health/ready',
  ];

  for (const path of apiPaths) {
    const route = evaluateRoute(result.parsedConfig, path);
    assert.strictEqual(route.upstream, 'api:3001');
    assert.strictEqual(route.upstreamName, 'api');
    assert.strictEqual(route.matcher, '@api');
    assert.strictEqual(route.headersUp['X-Forwarded-Host'], '{host}');
    assert.strictEqual(route.headersUp['X-Forwarded-Proto'], '{scheme}');
    assert.strictEqual(route.responseHeaders['X-Content-Type-Options'], 'nosniff');
    assert.strictEqual(route.responseHeaders['X-Frame-Options'], 'DENY');
    assert.ok(route.removedResponseHeaders.includes('Server'));
  }
});

test('evaluateRoute: accurately routes quarantine storage objects to garage:3900 with SigV4 Host header', () => {
  const result = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);
  const objectPaths = [
    '/acres-quarantine/temp-123/file.csv',
    '/acres-quarantine/organizations/org-1/uploads/test.csv',
    '/acres-quarantine/exports/exp-999.csv',
  ];

  for (const path of objectPaths) {
    const route = evaluateRoute(result.parsedConfig, path);
    assert.strictEqual(route.upstream, 'garage:3900');
    assert.strictEqual(route.upstreamName, 'objects');
    assert.strictEqual(route.matcher, '@objects');
    // Critical S3 SigV4 invariant: Host header MUST be preserved
    assert.strictEqual(route.headersUp['Host'], '{host}');
    assert.strictEqual(route.transport.read_timeout, '{$ACRES_OBJECT_READ_TIMEOUT}');
  }
});

test('evaluateRoute: routes all frontend application and static assets to next:3000', () => {
  const result = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);
  const nextPaths = [
    '/',
    '/login',
    '/register',
    '/app',
    '/app/dashboards',
    '/app/datasets',
    '/app/reports',
    '/app/members',
    '/_next/static/chunks/main-app.js',
    '/_next/image?url=%2Fhero.png&w=1280&q=75',
    '/favicon.ico',
    '/site.webmanifest',
  ];

  for (const path of nextPaths) {
    const route = evaluateRoute(result.parsedConfig, path);
    assert.strictEqual(route.upstream, 'next:3000');
    assert.strictEqual(route.upstreamName, 'next');
    assert.strictEqual(route.matcher, null);
    assert.strictEqual(route.matchedPattern, '*');
    assert.strictEqual(route.transport.read_timeout, '{$ACRES_NEXT_READ_TIMEOUT}');
  }
});

test('verifyCaddyfile: enforces edge security headers and banner removal', () => {
  // Test missing X-Frame-Options
  const missingHeaderConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    header_up Host {host}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;

  const missingHeaderResult = verifyCaddyfile(missingHeaderConfig);
  assert.strictEqual(missingHeaderResult.valid, false);
  assert.ok(missingHeaderResult.errors.some((e) => e.includes('X-Frame-Options')));

  // Test missing -Server
  const missingServerRemovalConfig = missingHeaderConfig.replace('-Server', '');
  const missingServerResult = verifyCaddyfile(missingServerRemovalConfig);
  assert.strictEqual(missingServerResult.valid, false);
  assert.ok(missingServerResult.errors.some((e) => e.includes('-Server')));
});

test('verifyCaddyfile: enforces S3 SigV4 Host header preservation on Garage', () => {
  const missingHostUpConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;

  const result = verifyCaddyfile(missingHostUpConfig);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('SigV4') || e.includes('header_up Host')));
});

test('verifyCaddyfile: enforces proxy headers (X-Forwarded-Host / Proto) on API', () => {
  const missingProxyHeadersConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    header_up Host {host}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;

  const result = verifyCaddyfile(missingProxyHeadersConfig);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('X-Forwarded-Host')));
});

test('verifyCaddyfile: enforces transport timeouts across all backends', () => {
  const missingTimeoutConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    header_up Host {host}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      dial_timeout 10s
    }
  }
}
`;

  const result = verifyCaddyfile(missingTimeoutConfig);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('timeout')));
});

test('verifyCaddyfile: HSTS gate invariant verification', () => {
  // 1. Reference Caddyfile has HSTS commented out
  const refResult = verifyCaddyfile(DEFAULT_CADDYFILE_PATH);
  assert.strictEqual(refResult.valid, true);

  // 2. Active HSTS without operator approval triggers fail-closed error
  const activeHstsConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  header Strict-Transport-Security "max-age=31536000; includeSubDomains"
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  @objects path /acres-quarantine/*
  reverse_proxy @objects garage:3900 {
    header_up Host {host}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;

  const unapprovedResult = verifyCaddyfile(activeHstsConfig);
  assert.strictEqual(unapprovedResult.valid, false);
  assert.ok(unapprovedResult.errors.some((e) => e.includes('HSTS gate invariant violated')));

  // 3. Approved HSTS with allowHsts: true passes
  const approvedResult = verifyCaddyfile(activeHstsConfig, { allowHsts: true });
  assert.strictEqual(approvedResult.valid, true);
});

test('verifyCaddyfile: fails closed on corrupted syntax or missing fallback', () => {
  // Empty content
  assert.strictEqual(verifyCaddyfile('').valid, false);

  // Missing fallback proxy
  const noFallbackConfig = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/* /graphql /health /health/ready
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;
  const noFallbackResult = verifyCaddyfile(noFallbackConfig);
  assert.strictEqual(noFallbackResult.valid, false);
  assert.ok(noFallbackResult.errors.some((e) => e.includes('fallback')));
});

test('verifyCaddyfile: throws clear error when target path does not exist', () => {
  assert.throws(
    () => verifyCaddyfile('infra/caddy/non-existent-caddyfile.example'),
    /Caddyfile not found at path: "infra\/caddy\/non-existent-caddyfile.example"/
  );
});

test('parseCaddyfile: preserves quoted hashtags inside header directives', () => {
  const config = `
{
  admin off
  email test@example.com
}
example.com {
  encode zstd gzip
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    X-Custom "value # with hash" # this is a comment
    -Server
  }
  request_body {
    max_size 10MB
  }
  @api path /api/*
  reverse_proxy @api api:3001 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
  reverse_proxy next:3000 {
    transport http {
      read_timeout 30s
      write_timeout 30s
      dial_timeout 10s
    }
  }
}
`;
  const parsed = parseCaddyfile(config);
  assert.strictEqual(parsed.siteBlocks[0].headers['X-Custom'], 'value # with hash');
});

