import { A, createAsync, useLocation, useSubmission } from "@solidjs/router";
import { ErrorBoundary, Show, Suspense } from "solid-js";
import FileText from "lucide-solid/icons/file-text";
import MessageSquare from "lucide-solid/icons/message-square";
import FileDown from "lucide-solid/icons/file-down";
import BrainCircuit from "lucide-solid/icons/brain-circuit";
import Info from "lucide-solid/icons/info";
import LogOut from "lucide-solid/icons/log-out";
import User from "lucide-solid/icons/user";
import { getModels } from "~/lib/models";
import { getUser, logout } from "~/lib/auth";
import { DEFAULT_MODEL_ID } from "~/lib/config";

// -- Top bar Nav --------------------------------------------------------------

export default function Nav() {
  const location = useLocation();
  const isChat = () => location.pathname === "/chat";

  const models = createAsync(() => getModels());
  const activeModelName = () => {
    const m = models();
    if (!m) return undefined;
    return m.find((model) => model.id === DEFAULT_MODEL_ID)?.name;
  };

  return (
    <>
      <div class="navbar-start gap-3">
        <Show when={isChat()}>
          <div class="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <FileText class="h-5 w-5 text-primary-content" />
          </div>
        </Show>
        <div>
          <A href="/chat" class="text-lg font-bold leading-tight">
            PDS Agent
          </A>
          <Show when={isChat()}>
            <p class="text-xs opacity-50 hidden sm:block">
              NovigiSuper — Product Disclosure Statement
            </p>
          </Show>
        </div>
      </div>

      <div class="navbar-end gap-2">
        <Show when={isChat()}>
          <div class="hidden md:flex items-center gap-2">
            <div class="badge badge-ghost gap-1 text-xs">
              <span class="w-2 h-2 rounded-full bg-success inline-block" />
              {activeModelName() ?? DEFAULT_MODEL_ID}
            </div>
          </div>
        </Show>
        <UserDropdown />
      </div>
    </>
  );
}

// -- Sidebar Nav --------------------------------------------------------------

export function SidebarNav() {
  const location = useLocation();
  const active = (path: string) =>
    path === location.pathname ? "menu-active" : "";

  return (
    <ul class="menu w-full gap-1 p-4">
      <li class="menu-title">Navigation</li>
      <li>
        <A href="/chat" class={active("/chat")}>
          <MessageSquare class="h-4 w-4" />
          Chat
        </A>
      </li>
      <li>
        <A href="/document" class={active("/document")}>
          <FileDown class="h-4 w-4" />
          Convert
        </A>
      </li>
      <li>
        <A href="/extract" class={active("/extract")}>
          <BrainCircuit class="h-4 w-4" />
          Extract
        </A>
      </li>
      <li>
        <A href="/about" class={active("/about")}>
          <Info class="h-4 w-4" />
          About
        </A>
      </li>
    </ul>
  );
}

// -- User dropdown ------------------------------------------------------------

function UserDropdown() {
  const user = createAsync(() => getUser(), { deferStream: true });
  const loggingOut = useSubmission(logout);

  return (
    <ErrorBoundary fallback={() => null}>
      <Suspense
        fallback={(
          <div class="btn btn-ghost btn-circle avatar placeholder" aria-hidden="true">
            <div class="w-10 rounded-full bg-base-200" />
          </div>
        )}
      >
        <Show when={user()}>
          <div class="dropdown dropdown-end">
            <div
              tabindex="0"
              role="button"
              class="btn btn-ghost btn-circle avatar placeholder"
            >
              <div class="w-10 rounded-full bg-neutral text-neutral-content">
                <User class="h-5 w-5" />
              </div>
            </div>
            <ul
              tabindex="0"
              class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-300"
            >
              <li class="menu-title">
                <span class="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Account
                </span>
              </li>
              <li>
                <span class="text-sm text-base-content/70 cursor-default hover:bg-transparent">
                  {user()!.username}
                </span>
              </li>
              <div class="divider my-1" />
              <li>
                <form action={logout} method="post">
                  <button
                    type="submit"
                    class="text-error w-full text-left flex items-center gap-2"
                    disabled={loggingOut.pending}
                  >
                    <LogOut class="w-4 h-4" />
                    {loggingOut.pending ? "Logging out..." : "Logout"}
                  </button>
                </form>
              </li>
            </ul>
          </div>
        </Show>
      </Suspense>
    </ErrorBoundary>
  );
}
