import { requireRole } from "@/lib/auth/guards";
import { listMyConversations } from "@/actions/messages";
import { BackButton } from "@/components/buyer/back-button";
import { ConversationList } from "./conversation-list";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  await requireRole("buyer");
  const initial = await listMyConversations();

  return (
    <div className="mx-auto max-w-lg p-4">
      <BackButton />
      <h1 className="mb-4 text-xl font-bold">Messages</h1>
      <ConversationList initial={initial} />
    </div>
  );
}
