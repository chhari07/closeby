import { t, th, type StringKey } from "@/lib/i18n/strings";

// Puts the Hindi label alongside the English one for key actions, per the
// design spec — small enough to fit inside a button without crowding it.
export function Bilingual({ k }: { k: StringKey }) {
  return (
    <span>
      {t(k)} <span className="opacity-80">/ {th(k)}</span>
    </span>
  );
}
