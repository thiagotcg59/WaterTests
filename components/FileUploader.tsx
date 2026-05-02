import React, { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileUploaderProps {
  onFileLoaded: (content: string, fileName: string) => void;
  onLoadPreset?: () => void;
  isLoadingPreset?: boolean;
}

export default function FileUploader({ onFileLoaded, onLoadPreset, isLoadingPreset = false }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = 'inp-file-upload';

  useEffect(() => {
    const preventWindowDrop = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener('dragover', preventWindowDrop);
    window.addEventListener('drop', preventWindowDrop);

    return () => {
      window.removeEventListener('dragover', preventWindowDrop);
      window.removeEventListener('drop', preventWindowDrop);
    };
  }, []);

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.inp')) {
      alert('Por favor, selecione um arquivo .inp válido.');
      return;
    }
    const content = await file.text();
    onFileLoaded(content, file.name);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const openPicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`border border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
        isDragging
          ? 'border-red-500 bg-red-950/20'
          : 'border-zinc-800 hover:border-zinc-600 bg-black'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={openPicker}
    >
      <input
        id={inputId}
        type="file"
        accept=".inp"
        className="hidden"
        ref={fileInputRef}
        onChange={onFileChange}
      />
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg">
          <Upload className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <p className="text-lg font-medium text-zinc-100">
            Arraste ou clique para enviar
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Selecione um arquivo de modelo EPANET (.inp)
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPicker();
            }}
            className="mt-4 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500"
          >
            Escolher arquivo INP
          </button>
          {onLoadPreset && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLoadPreset();
              }}
              disabled={isLoadingPreset}
              className={`mt-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                isLoadingPreset
                  ? 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500'
                  : 'border-red-500/60 bg-red-500/10 text-red-200 hover:bg-red-500/20'
              }`}
            >
              {isLoadingPreset ? 'Abrindo arquivo...' : 'Abrir teste03-regenerado.inp'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
