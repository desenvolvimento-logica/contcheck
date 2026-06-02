import { useRef, useState, type DragEvent } from "react";
import { Upload, FileText, X } from "lucide-react";

type Props = {
  onFile: (file: File) => void;
  file: File | null;
  onClear: () => void;
  disabled?: boolean;
};

export function UploadArea({ onFile, file, onClear, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === "application/pdf") onFile(f);
  }

  if (file) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-md bg-accent/30 p-2">
            <FileText className="h-5 w-5 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
          aria-label="Remover arquivo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
        drag
          ? "border-accent bg-accent/10"
          : "border-border bg-card hover:border-accent/60 hover:bg-muted/50"
      }`}
    >
      <div className="rounded-full bg-accent/30 p-3">
        <Upload className="h-6 w-6 text-accent-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          Clique para selecionar ou arraste o PDF
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Apenas arquivos no formato PDF
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
