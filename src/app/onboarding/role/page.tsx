import { redirect } from "next/navigation";
import { getMe } from "@/actions/users";
import { RolePickerForm } from "./role-picker-form";

export const dynamic = "force-dynamic";

export default async function RolePickerPage() {
  const me = await getMe();

  // The users table is the source of truth for role. If it's already set, this
  // is a one-time picker — never show it again.
  if (me?.role) {
    redirect(me.role === "shop_owner" ? "/shop/onboarding" : "/shops");
  }

  return <RolePickerForm />;
}
