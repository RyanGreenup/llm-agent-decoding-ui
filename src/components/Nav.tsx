import { A, createAsync, useLocation, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import FileText from "lucide-solid/icons/file-text";
import ChevronDown from "lucide-solid/icons/chevron-down";
import LogOut from "lucide-solid/icons/log-out";
import { getModels } from "~/lib/models";
import { getUser, logout } from "~/lib/auth";
import { DEFAULT_MODEL_ID } from "~/lib/config";
import { Button } from "~/components/Button";

export default function Nav() {
  const location = useLocation();
  const active = (path: string) => (path === location.pathname ? "active" : "");
  const isChat = () => location.pathname === "/chat";

  const models = createAsync(() => getModels());
  const activeModelName = () => {
    const m = models();
    if (!m) return undefined;
    return m.find((model) => model.id === DEFAULT_MODEL_ID)?.name;
  };

  return (
    <div class="navbar bg-base-100 shadow-sm border-b border-base-300 px-6">
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
            <p class="text-xs opacity-50">
              NovigiSuper — Product Disclosure Statement
            </p>
          </Show>
        </div>
      </div>
      <div class="navbar-end gap-2">
        <Show when={isChat()}>
          <div class="badge badge-ghost gap-1 text-xs">
            <span class="w-2 h-2 rounded-full bg-success inline-block" />
            {activeModelName() ?? DEFAULT_MODEL_ID}
          </div>
          <div class="badge badge-outline text-xs">ReAct + Reflect</div>
        </Show>
        <ul class="menu menu-horizontal px-1">
          <li>
            <A href="/chat" class={active("/chat")}>
              Chat
            </A>
          </li>
          <li>
            <A href="/document" class={active("/document")}>
              Convert
            </A>
          </li>
          <li>
            <A href="/about" class={active("/about")}>
              About
            </A>
          </li>
        </ul>
        <UserDropdown />
      </div>
    </div>
  );
}

function UserDropdown() {
  const user = createAsync(() => getUser(), { deferStream: true });
  const loggingOut = useSubmission(logout);

  return (
    <Show when={user()}>
      <div class="dropdown dropdown-end">
        <Button variant="ghost" tabindex="0">
          <span class="text-sm">{user()!.username}</span>
          <ChevronDown class="ml-1 w-4 h-4" />
        </Button>
        <ul
          tabindex="0"
          class="menu menu-sm dropdown-content mt-1 z-[1] p-2 shadow bg-base-100 rounded-box w-52 border border-base-300"
        >
          <li class="menu-title">
            <span class="text-xs font-semibold uppercase tracking-wide text-base-content/60">
              Account
            </span>
          </li>
          <li>
            <span class="px-3 py-2 text-sm text-base-content/70 cursor-default hover:bg-transparent">
              {user()!.username} ({user()!.clientId})
            </span>
          </li>
          <div class="divider my-1" />
          <li>
            <form action={logout} method="post">
              <button
                type="submit"
                class="px-3 py-2 text-error w-full text-left flex items-center hover:bg-error/10 rounded-lg transition-colors"
                disabled={loggingOut.pending}
              >
                <LogOut class="w-4 h-4 mr-2" />
                {loggingOut.pending ? "Logging out..." : "Logout"}
              </button>
            </form>
          </li>
        </ul>
      </div>
    </Show>
  );
}
