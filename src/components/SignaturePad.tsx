import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "./ui";

/** Finger/mouse signature capture → transparent PNG data URL. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14233f";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  return (
    <div>
      <canvas
        ref={ref}
        aria-label="Signature area"
        className="h-40 w-full touch-none rounded-xl border border-dashed border-hairline bg-surface"
        onPointerDown={(e) => {
          drawing.current = true;
          ref.current!.setPointerCapture(e.pointerId);
          const { x, y } = pos(e);
          const ctx = ref.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const { x, y } = pos(e);
          const ctx = ref.current!.getContext("2d")!;
          ctx.lineTo(x, y);
          ctx.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (!empty || true) onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <div className="mt-2 flex justify-between">
        <p className="text-xs text-muted-foreground">Sign with a finger or mouse.</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange("");
          }}
        >
          <Eraser className="h-4 w-4" /> Clear
        </Button>
      </div>
    </div>
  );
}
