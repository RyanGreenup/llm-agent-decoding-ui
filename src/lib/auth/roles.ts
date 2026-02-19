import { action, redirect } from "@solidjs/router";
import { PriviligedRoles, requireUser } from "./index";
import { getSession } from "./server";
import { executeAuthQuery, executeAuthQueryOne } from "../db/postgres/auth-pool";

export type UserClient = {
  user_id: string;
  username: string;
  client_id: string;
};

export type ClientOption = {
  client_id: string;
  supplier_name: string;
};

export async function lookupClientId(
  userId: string,
): Promise<string | undefined> {
  "use server";

  const result = await executeAuthQueryOne<UserClient>(
    `SELECT u.user_id, u.username, cs.client_id
     FROM bunnings.client_supplier_ids cs
     INNER JOIN auth.user_credentials u ON u.client_id = cs.client_id
     WHERE u.user_id = $1`,
    [userId],
  );

  // TODO should we throw here?
  if (!result) {
    throw redirect("/login");
  }

  return result.client_id;
}

export async function getClientOptions(): Promise<ClientOption[]> {
  "use server";

  return executeAuthQuery<ClientOption>(
    `SELECT s.user_id AS client_id, s.short_name AS supplier_name
     FROM field_ops.suppliers s
     WHERE s.status = 'active' AND s.role = 'supplier'
     ORDER BY s.short_name`,
  );
}

export async function getUserRole(userId: string): Promise<string | undefined> {
  "use server";

  const result = await executeAuthQueryOne<{ role: string }>(
    `SELECT role
     FROM auth.user_credentials
     WHERE user_id = $1`,
    [userId],
  );

  return result?.role;
}



export async function isAuthorizedToSeeAdmin(): Promise<boolean> {
  "use server";

  try {
    const user = await requireUser();
    const role = await getUserRole(user.id);
    return role ? PriviligedRoles.includes(role): false;
  } catch {
    return false;
  }
}

export const switchClientId = action(async (formData: FormData) => {
  "use server";

  // Get the username
  const user = await requireUser();

  // Check authorization first (double check db too)
  const current_role = await getUserRole(user.id);
  const authorized = await isAuthorizedToSeeAdmin();
  if (
    !authorized ||
    !current_role ||
    !PriviligedRoles.includes(current_role)
  ) {
    return new Error(
      "Unauthorized: Only staff and admin users can switch client ID",
    );
  }

  const newClientId = String(formData.get("clientId"));
  if (!newClientId) {
    return new Error("Client ID is required");
  }

  // Validate that the client exists and is active
  const client = await executeAuthQueryOne<{ user_id: string }>(
    `SELECT user_id
     FROM field_ops.suppliers
     WHERE user_id = $1 AND status = 'active' AND role = 'supplier'`,
    [newClientId],
  );

  if (!client) {
    return new Error("Invalid or inactive client ID");
  }

  try {
    // Update the session with the new client ID
    const session = await getSession();
    await session.update((d) => {
      d.clientId = newClientId;
    });

    console.log(`(${user.username}) Client ID switched to: ${newClientId}`);
    return { success: true, clientId: newClientId };
  } catch (error) {
    console.error("Failed to update session:", error);
    return new Error("Failed to switch client ID");
  }
});
