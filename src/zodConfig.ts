import { z } from 'zod';

// zod probes eval() for speed when schemas are created; the CSP forbids eval, so turn the probe off.
// Imported first in main.tsx, before any module that defines a schema.
z.config({ jitless: true });
