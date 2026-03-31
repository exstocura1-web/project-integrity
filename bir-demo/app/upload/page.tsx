import { LayoutShell } from "@/components/LayoutShell";
import { UploadCard } from "@/components/UploadCard";
import Link from "next/link";

export default function UploadPage() {
  return (
    <LayoutShell
      rightSlot={
        <Link href="/" style={{ fontSize: 14, color: "var(--muted)" }}>
          Gate info
        </Link>
      }
    >
      <UploadCard />
    </LayoutShell>
  );
}
