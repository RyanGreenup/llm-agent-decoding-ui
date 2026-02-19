import { action, createAsync, query, redirect } from "@solidjs/router";
import type { Accessor } from "solid-js";
import { getRequestEvent } from "solid-js/web";
import { getEvent, getRequestIP } from "vinxi/http";
import { logAuditEvent } from "~/lib/audit";
import { findUserById } from "./db";
import {
  checkLoginRateLimit,
  penalizeFailedLogin,
  resetOnSuccess,
} from "./rate-limit";
import {
  getSession,
  login as loginUser,
  logout as logoutSession,
} from "./server";
import { lookupClientId, getUserRole } from "./roles";

/**
 * Roles that can see the client_id switcher
 */
export const PriviligedRoles = ["staff", "admin"];

export type User = {
  id: string;
  username: string;
  clientId: string;
  role?: string;
};

/**
 * Get the currently authenticated user from the session
 *
 * @returns User object with id and username
 * @throws Redirects to /login if no user is authenticated or user not found
 *
 * NOTE, I've found If the client does not support cookies, this will return undefined
 */
export const getUser = query(async (): Promise<User | undefined> => {
  "use server";
  try {
    const session = await getSession();
    const userId = session.data.userId;
    if (userId === undefined) throw new Error("User not found");
    const user = await findUserById(userId);
    if (!user) throw new Error("User not found");
    const role = await getUserRole(userId);
    return {
      id: user.id,
      username: user.username,
      clientId: session.data.clientId,
      role,
    };
  } catch (error) {
    throw redirect("/login");
  }
}, "user");

/**
 * Get the currently authenticated user from the session
 *
 * @returns User object with id and username
 * @throws Redirects to /login if no user is authenticated or user not found
 *
 */
export async function requireUser(): Promise<User> {
  "use server";
  const user = await getUser();

  // Confirm the user is defined
  if (!user || typeof user !== "object" || !user.id || !user.username) {
    throw redirect("/login");
  }

  return user;
}

export const getAdminUser = query(async () => {
  "use server";
  const user = await requireUser();
  if (!user.role || !PriviligedRoles.includes(user.role)) {
    const event = getRequestEvent();
    if (event) event.response.status = 403;
    const ip = getRequestIP(getEvent(), { xForwardedFor: true }) ?? "unknown";
    logAuditEvent({
      userId: user.id,
      username: user.username,
      eventType: "admin_access_denied",
      details: `Insufficient role: ${user.role ?? "none"}`,
      ipAddress: ip,
    });
    return undefined;
  }
  return user;
}, "admin-user");

/** Auth gate — blocks streaming until auth resolves (clean 302 if unauth) */
export function createProtectedRoute(): Accessor<User | undefined>;
/** Auth gate + data loading in the same component */
export function createProtectedRoute<T>(fetcher: () => Promise<T>): Accessor<T | undefined>;
export function createProtectedRoute<T>(fetcher?: () => Promise<T>) {
  const user = createAsync(() => getUser(), { deferStream: true });
  // Keep auth-gated route data on the same streaming policy as auth itself.
  // This avoids a class of SSR/client timing mismatches where auth blocks stream
  // but feature data still streams in later and changes boundary structure.
  if (fetcher) return createAsync(fetcher, { deferStream: true });
  return user;
}

/** Staff/admin gate — blocks streaming, returns undefined if user lacks a privileged role */
export function createProtectedStaffRoute(): Accessor<User | undefined> {
  return createAsync(() => getAdminUser(), { deferStream: true });
}

/**
 * Handle user login
 *
 * @param formData - Form data containing username and password
 * @returns Redirect to home page on success, or Error with message on failure
 */
export const login = action(async (formData: FormData) => {
  "use server";
  const username = String(formData.get("username"));
  const password = String(formData.get("password"));
  const ip = getRequestIP(getEvent(), { xForwardedFor: true }) ?? "unknown";

  const { blocked, retrySecs } = await checkLoginRateLimit(ip, username);
  if (blocked) {
    return new Error(
      `Too many login attempts. Please try again in ${Math.ceil(retrySecs / 60)} minute(s).`,
    );
  }

  try {
    const user = await loginUser(username, password);
    const session = await getSession();
    const clientId = await lookupClientId(user.id);
    await session.update((d) => {
      d.userId = user.id;
      d.clientId = clientId;
    });
    await resetOnSuccess(ip, username);
    logAuditEvent({
      userId: user.id,
      username,
      eventType: "login",
      details: "Successful login",
      ipAddress: ip,
    });
  } catch (err) {
    await penalizeFailedLogin(ip, username);
    logAuditEvent({
      username,
      eventType: "login_failed",
      details: "Invalid credentials",
      ipAddress: ip,
    });
    return err as Error;
  }
  throw redirect("/");
});

export const logout = action(async () => {
  "use server";
  const user = await requireUser();
  const ip = getRequestIP(getEvent(), { xForwardedFor: true }) ?? "unknown";
  logAuditEvent({
    userId: user.id,
    username: user.username,
    eventType: "logout",
    details: "User logged out",
    ipAddress: ip,
  });
  await logoutSession();
  throw redirect("/login");
});
