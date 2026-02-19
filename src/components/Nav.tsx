import { A, useLocation } from "@solidjs/router";

export default function Nav() {
  const location = useLocation();
  const active = (path: string) => (path === location.pathname ? "active" : "");

  return (
    <div class="navbar bg-base-100 shadow-sm">
      <div class="navbar-start">
        <A href="/" class="btn btn-ghost text-xl">
          LLM Agent
        </A>
      </div>
      <div class="navbar-end">
        <ul class="menu menu-horizontal px-1">
          <li>
            <A href="/" class={active("/")}>
              Home
            </A>
          </li>
          <li>
            <A href="/document" class={active("/convert")}>
              Convert
            </A>
          </li>
          <li>
            <A href="/about" class={active("/about")}>
              About
            </A>
          </li>
        </ul>
      </div>
    </div>
  );
}
