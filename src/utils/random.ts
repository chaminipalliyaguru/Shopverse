import { randomUUID } from 'crypto';

/** Short unique id, safe to run tests in parallel and across workers. */
export const uid = () => randomUUID().replace(/-/g, '').slice(0, 10);

/** Unique email in the .test TLD (never deliverable). */
export const uniqueEmail = (prefix = 'pw') => `${prefix}.${uid()}@shopverse.test`;
