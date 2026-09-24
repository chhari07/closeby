import { currentUser } from "@clerk/nextjs/server";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getMyShop } from "@/actions/shops";
import { ProfileForm } from "./profile-form";
import { AddressesCard } from "./addresses-card";
import { ShopProfileCard } from "./shop-profile-card";
import { EmailAlertsCard } from "./email-alerts-card";
import { getEmailAlerts } from "@/actions/presence";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await requireOnboardedUser();
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const [shop, emailAlerts] = await Promise.all([
    me.role === "shop_owner" ? getMyShop() : Promise.resolve(null),
    getEmailAlerts(),
  ]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-4 pb-24 sm:p-6">
      <h1 className="text-xl font-bold">Profile</h1>
      <ProfileForm
        me={{
          name: me.name,
          phone: me.phone,
          role: me.role,
          createdAt: me.createdAt,
        }}
        email={email}
      />
      {me.role === "buyer" && (
        <AddressesCard initial={me.savedAddresses ?? []} />
      )}
      {me.role === "shop_owner" && shop && <ShopProfileCard shop={shop} />}
      <EmailAlertsCard initial={emailAlerts} email={email} role={me.role} />
    </div>
  );
}
