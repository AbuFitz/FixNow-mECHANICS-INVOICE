import { useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui";
import { captureDocument, type CapturedDocument } from "@/lib/capture";

export function CaptureButton({ onCaptured, label = "Scan receipt" }: { onCaptured: (c: CapturedDocument, file: File) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true);
        try {
          const c = await captureDocument(f);
          onCaptured(c, f);
          toast.success("Read it — please check the details before saving.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't read that.");
        } finally {
          setBusy(false);
          if (ref.current) ref.current.value = "";
        }
      }} />
      <Button loading={busy} onClick={() => ref.current?.click()}><ScanLine className="h-4 w-4" /> {label}</Button>
    </>
  );
}
