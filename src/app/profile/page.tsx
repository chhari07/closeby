import { requireOnboardedUser } from "@/lib/auth/guards";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await requireOnboardedUser();

  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-bold">Profile</h1>
      <ProfileForm me={me} />
    </div>
  );
}
