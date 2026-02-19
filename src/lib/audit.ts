"use server";

import { executeRun } from "./db/sqlite";

type AuditEvent = {
  userId?: string;
  username: string;
  eventType: string;
  details?: string;
  ipAddress?: string;
  meta?: Record<string, unknown>;
};

const LOOPBACK = new Set(["127.0.0.1", "::1"]);

/** Strip Node's IPv4-mapped IPv6 prefix and null-out loopback addresses. */
function normalizeIp(raw?: string): string | null {
  if (!raw) return null;
  const ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return LOOPBACK.has(ip) ? null : ip;
}

export function logAuditEvent(event: AuditEvent): void {
  "use server";
  try {
    executeRun(
      `INSERT INTO audit_log (user_id, username, event_type, details, ip_address, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.userId ?? null,
        event.username,
        event.eventType,
        event.details ?? "",
        normalizeIp(event.ipAddress),
        event.meta ? JSON.stringify(event.meta) : null,
      ],
    );
  } catch (err) {
    console.error("Audit log insert failed:", err);
  }
}
