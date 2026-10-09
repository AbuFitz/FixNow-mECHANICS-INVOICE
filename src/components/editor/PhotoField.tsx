import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { DocPhoto } from "@/lib/types";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/images";
import { uid } from "@/lib/format";
import { Button } from "../ui";

export function PhotoField({ photos, onChange, folder, max = 6, label = "Add photo" }: { photos: DocPhoto[]; onChange: (p: DocPhoto[]) => void; folder: string; max?: number; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const next = [...photos];
      for (const f of Array.from(files).slice(0, max - photos.length)) {
        const blob = await compressImage(f);
        const url = await api.files.uploadImage(blob, folder);
        next.push({ id: uid(), url, caption: "" });
      }
      onChange(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <div key={p.id} className="group relative overflow-hidden rounded-xl border border-hairline bg-surface-2">
            <img src={p.url} alt={p.caption || "Attached photo"} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            <button type="button" aria-label="Remove photo" onClick={() => onChange(photos.filter((x) => x.id !== p.id))} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-ink/80 text-white">
              <X className="h-4 w-4" />
            </button>
            <input
              aria-label="Photo caption"
              placeholder="Caption (shown on the PDF)"
              value={p.caption ?? ""}
              onChange={(e) => onChange(photos.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)))}
              className="w-full border-t border-hairline bg-surface px-2.5 py-2 text-xs outline-none focus:bg-signal/10"
            />
          </div>
        ))}
        {photos.length < max ? (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="press grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-hairline bg-surface text-muted-foreground hover:border-signal-deep hover:text-foreground">
            <span className="flex flex-col items-center gap-1.5 text-xs font-semibold">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {busy ? "Uploading…" : label}
            </span>
          </button>
        ) : null}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <div className="mt-2 flex gap-2 sm:hidden">
        <Button size="sm" variant="outline" onClick={() => { input.current?.setAttribute("capture", "environment"); input.current?.click(); input.current?.removeAttribute("capture"); }}>
          <Camera className="h-4 w-4" /> Take photo
        </Button>
      </div>
    </div>
  );
}
