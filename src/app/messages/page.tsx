import { requireRole } from "@/lib/auth/guards";
import { listMyMessages } from "@/actions/messages";
import { BackButton } from "@/components/buyer/back-button";
import { MessagesList } from "./messages-list";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  await requireRole("buyer");
  const initial = await listMyMessages();

  return (
    <div className="mx-auto max-w-lg p-4">
      <BackButton />
      <h1 className="mb-4 text-xl font-bold">Messages</h1>
      <MessagesList initial={initial} />
    </div>
  );
}
