import FileText from "lucide-solid/icons/file-text";
import { splitProps } from "solid-js";

interface ChatNavbarProps {
  title?: string;
  subtitle?: string;
  model?: string;
  strategy?: string;
}

export default function ChatNavbar(props: ChatNavbarProps) {
  const [local] = splitProps(props, [
    "title",
    "subtitle",
    "model",
    "strategy",
  ]);

  return (
    <div class="navbar bg-base-100 shadow-sm border-b border-base-300 px-6">
      <div class="flex-1 gap-3">
        <div class="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
          <FileText class="h-5 w-5 text-primary-content" />
        </div>
        <div>
          <h1 class="text-lg font-bold leading-tight">
            {local.title ?? "PDS Agent"}
          </h1>
          <p class="text-xs opacity-50">
            {local.subtitle ?? "NovigiSuper — Product Disclosure Statement"}
          </p>
        </div>
      </div>
      <div class="flex-none gap-2">
        <div class="badge badge-ghost gap-1 text-xs">
          <span class="w-2 h-2 rounded-full bg-success inline-block"></span>
          {local.model ?? "gpt-4o-mini"}
        </div>
        <div class="badge badge-outline text-xs">
          {local.strategy ?? "ReAct + Reflect"}
        </div>
      </div>
    </div>
  );
}
