import AvatarBadge from "./AvatarBadge";

export default function TypingIndicator() {
  return (
    <div class="chat chat-start">
      <AvatarBadge />
      <div class="chat-bubble bg-base-100 text-base-content shadow-sm border border-base-300">
        <div class="flex items-center gap-1 py-1">
          <span class="w-1.5 h-1.5 rounded-full bg-current opacity-20 animate-pulse"></span>
          <span
            class="w-1.5 h-1.5 rounded-full bg-current opacity-20 animate-pulse"
            style="animation-delay: 0.2s"
          ></span>
          <span
            class="w-1.5 h-1.5 rounded-full bg-current opacity-20 animate-pulse"
            style="animation-delay: 0.4s"
          ></span>
        </div>
      </div>
    </div>
  );
}
