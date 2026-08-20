# Acres

Acres is organized as an npm workspace. The Next.js application lives in
`client/`; the repository root owns workspace installation and command
forwarding.

## Commands

Install dependencies from the repository root:

```bash
npm install
```

Run the Next.js development server:

```bash
npm run dev
```

Check lint:

```bash
npm run lint
```

Build the production client:

```bash
npm run build
```

Serve the production build after `npm run build`:

```bash
npm run start
```

All commands are run from the repository root and forwarded to
`@acres/client`.
