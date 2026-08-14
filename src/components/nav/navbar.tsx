import { auth } from "@clerk/nextjs/server";
import { getMe } from "@/actions/users";
import { NavbarClient } from "./navbar-client";

export async function Navbar() {
  const { userId } = await auth();
  const me = userId ? await getMe() : null;

  return (
    <NavbarClient
      signedIn={!!userId}
      role={me?.role ?? null}
      name={me?.name ?? null}
    />
  );
}
