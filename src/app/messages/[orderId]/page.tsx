import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getConversation } from "@/actions/messages";
import { BackButton } from "@/components/buyer/back-button";
import { ChatThread } from "@/components/chat/chat-thread";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requireRole("buyer");
  const { orderId } = await params;
  const conversation = await getConversation(orderId);
  if (!conversation) notFound();

  return (
    // Full-height chat: header, scrolling messages, reply box pinned above the tab bar.
    <div className="mx-auto flex h-[calc(100svh-7.5rem)] max-w-lg flex-col p-4 sm:h-[calc(100svh-3.5rem)]">
      <BackButton />
      <div className="border-b pb-3">
        <h1 className="text-lg font-bold">{conversation.shopName}</h1>
        <Link href={`/orders/${orderId}`} className="text-primary-ink text-xs underline">
          Order #{orderId.slice(0, 8).toUpperCase()} · view order
        </Link>
      </div>
      <ChatThread initial={conversation} className="flex-1" />
    </div>
  );
}
