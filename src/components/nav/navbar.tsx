import { layoutUserId } from "@/lib/auth/layout-user";
import { getMe } from "@/actions/users";
import { NavbarClient } from "./navbar-client";
import { RoleTheme } from "@/components/role-theme";

export async function Navbar() {
  const userId = await layoutUserId();
  const me = userId ? await getMe() : null;

  return (
    <>
      <RoleTheme role={me?.role ?? null} />
      <NavbarClient
        signedIn={!!userId}
        role={me?.role ?? null}
        name={me?.name ?? null}
      />
    </>
  );
}
