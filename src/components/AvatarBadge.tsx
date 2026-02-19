import Bot from "lucide-solid/icons/bot";

export default function AvatarBadge() {
  return (
    <div class="chat-image avatar placeholder">
      <div class="bg-primary text-primary-content rounded-full w-10">
        <Bot class="h-5 w-5" />
      </div>
    </div>
  );
}
