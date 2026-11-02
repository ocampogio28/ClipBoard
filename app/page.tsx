"use client";

import React, { useEffect, useState, useRef } from "react";
import { get, set } from "idb-keyval";

export type ClipboardItemData = {
  id: string;
  type: "text" | "image";
  title?: string;
  content: string;
  x: number;
  y: number;
  zIndex: number;
  createdAt: number;
  width?: number;
  height?: number;
};

const STORAGE_KEY = "virtual_clipboard_items_v4";

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 380;

const playSound = (type: "paste" | "copy" | "shred" | "click") => {
  if (typeof window === "undefined") return;
  try {
    const AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof window.AudioContext })
        .webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "paste") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === "copy") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.setValueAtTime(800, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === "shred") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(60, now + 0.25);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "click") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch {
    // Audio context not allowed or supported
  }
};

export default function VirtualClipboardPage() {
  const [items, setItems] = useState<ClipboardItemData[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const maxZIndex = useRef(1);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStartDim = useRef({ w: 0, h: 0, x: 0, y: 0 });

  const [isOverShredder, setIsOverShredder] = useState(false);
  const shredderRef = useRef<HTMLDivElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editTextRef = useRef<HTMLTextAreaElement>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined" && navigator.storage?.persist) {
      navigator.storage.persist();
    }
    get<ClipboardItemData[]>(STORAGE_KEY).then((saved) => {
      if (saved && Array.isArray(saved)) {
        setItems(saved);
        const highestZ = saved.reduce(
          (max, i) => Math.max(max, i.zIndex || 1),
          1,
        );
        maxZIndex.current = highestZ;
      }
    });
  }, []);

  const saveItems = (newItems: ClipboardItemData[]) => {
    setItems(newItems);
    set(STORAGE_KEY, newItems);
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (editingId || renamingId) return;

    playSound("click");
    maxZIndex.current += 1;

    const newNote: ClipboardItemData = {
      id: crypto.randomUUID(),
      type: "text",
      content: "",
      x: e.clientX - 140,
      y: e.clientY - 40,
      width: 280,
      height: 200,
      zIndex: maxZIndex.current,
      createdAt: Date.now(),
    };

    const updated = [newNote, ...items];
    saveItems(updated);

    setEditingId(newNote.id);
    setTimeout(() => editTextRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!isMounted) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (editingId || renamingId) return;

      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const spawnX = 80 + (items.length % 8) * 30;
      const spawnY = 100 + (items.length % 8) * 30;
      maxZIndex.current += 1;

      for (const item of Array.from(clipboardItems)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = (event) => {
            playSound("paste");
            const newItem: ClipboardItemData = {
              id: crypto.randomUUID(),
              type: "image",
              content: event.target?.result as string,
              x: spawnX,
              y: spawnY,
              width: 300,
              height: 240,
              zIndex: maxZIndex.current,
              createdAt: Date.now(),
            };
            setItems((prev) => {
              const updated = [newItem, ...prev];
              set(STORAGE_KEY, updated);
              return updated;
            });
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }

        if (item.type === "text/plain") {
          item.getAsString((text) => {
            if (!text.trim()) return;
            playSound("paste");
            const newItem: ClipboardItemData = {
              id: crypto.randomUUID(),
              type: "text",
              content: text,
              x: spawnX,
              y: spawnY,
              width: 280,
              height: 200,
              zIndex: maxZIndex.current,
              createdAt: Date.now(),
            };
            setItems((prev) => {
              const updated = [newItem, ...prev];
              set(STORAGE_KEY, updated);
              return updated;
            });
          });
          e.preventDefault();
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isMounted, items.length, editingId, renamingId]);

  const handleMouseDownItem = (id: string, e: React.MouseEvent) => {
    if (editingId === id || renamingId === id) return;

    const targetTag = (e.target as HTMLElement).tagName;
    if (targetTag === "P" || targetTag === "A") return;

    e.stopPropagation();

    hasMoved.current = false;
    maxZIndex.current += 1;
    const updated = items.map((item) =>
      item.id === id ? { ...item, zIndex: maxZIndex.current } : item,
    );
    const target = updated.find((i) => i.id === id);
    if (target) {
      dragOffset.current = { x: e.clientX - target.x, y: e.clientY - target.y };
      setDraggingId(id);
    }
    saveItems(updated);
  };

  const handleMouseDownResize = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = items.find((i) => i.id === id);
    if (target) {
      resizeStartDim.current = {
        w: target.width || 280,
        h: target.height || 200,
        x: e.clientX,
        y: e.clientY,
      };
      setResizingId(id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingId) {
      hasMoved.current = true;
      const newX = Math.max(10, e.clientX - dragOffset.current.x);
      const newY = Math.max(100, e.clientY - dragOffset.current.y);
      setItems((prev) =>
        prev.map((item) =>
          item.id === draggingId ? { ...item, x: newX, y: newY } : item,
        ),
      );

      if (shredderRef.current) {
        const rect = shredderRef.current.getBoundingClientRect();
        const isOver =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        setIsOverShredder(isOver);
      }
    }

    if (resizingId) {
      const deltaX = e.clientX - resizeStartDim.current.x;
      const deltaY = e.clientY - resizeStartDim.current.y;

      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, resizeStartDim.current.w + deltaX),
      );
      const newHeight = Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, resizeStartDim.current.h + deltaY),
      );

      setItems((prev) =>
        prev.map((item) =>
          item.id === resizingId
            ? { ...item, width: newWidth, height: newHeight }
            : item,
        ),
      );
    }
  };

  const handleMouseUp = () => {
    if (draggingId) {
      if (isOverShredder) {
        playSound("shred");
        setItems((prev) => {
          const updated = prev.filter((item) => item.id !== draggingId);
          set(STORAGE_KEY, updated);
          return updated;
        });
      } else {
        set(STORAGE_KEY, items);
      }
      setDraggingId(null);
      setIsOverShredder(false);
    }
    if (resizingId) {
      setResizingId(null);
      set(STORAGE_KEY, items);
    }
  };

  const handleDoubleClickText = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSound("click");
    setEditingId(id);
    setTimeout(() => editTextRef.current?.focus(), 0);
  };

  const handleFinishEdit = (id: string) => {
    if (!editingId) return;
    const newContent = editTextRef.current?.value || "";

    if (!newContent.trim()) {
      saveItems(items.filter((item) => item.id !== id));
      setEditingId(null);
      return;
    }

    const updated = items.map((item) =>
      item.id === id ? { ...item, content: newContent } : item,
    );
    setEditingId(null);
    saveItems(updated);
  };

  const handleStartRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSound("click");
    setRenamingId(id);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleFinishRename = (id: string) => {
    if (!renamingId) return;
    const newTitle = renameInputRef.current?.value.trim() || "";

    const updated = items.map((item) =>
      item.id === id ? { ...item, title: newTitle || undefined } : item,
    );
    setRenamingId(null);
    saveItems(updated);
  };

  const copyImageToClipboard = async (
    dataUrl: string,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      playSound("copy");
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
  };

  const copyTextToClipboard = async (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    playSound("copy");
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1500);
  };

  const clearBoard = () => {
    playSound("shred");
    saveItems([]);
  };

  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-amber-800 underline hover:text-black break-all font-semibold"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#fbf9f5] text-[#2c2825] p-6 font-mono text-xs">
        Loading board...
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#fbf9f5] text-[#2c2825] relative overflow-auto font-mono select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <header className="fixed top-0 left-0 right-0 border-b border-[#d8d0c1] bg-[#fbf9f5]/90 backdrop-blur z-[99999]">
        <div className="bg-[#f2ebd9] text-[#786c56] border-b border-[#e2d8c3] px-6 py-1 text-center text-xs flex items-center justify-center gap-2">
          <span>
            <strong>Local-Only Storage:</strong> Data is saved in IndexedDB and
            cleared if browser cache is wiped.
          </span>
        </div>

        <div className="h-14 px-6 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold tracking-tight text-[#2c2825]">
              Virtual Clipboard
            </h1>
            <p className="text-xs text-[#786c56]">
              Paste (
              <kbd className="px-1 border border-[#d8d0c1] rounded bg-[#f4efe6]">
                Ctrl+V
              </kbd>
              ), Dbl-click canvas to create note. Dbl-click title to rename.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {copySuccess && (
              <span className="text-xs bg-[#2c2825] text-[#fbf9f5] px-2 py-0.5 shadow-sm">
                Copied to clipboard!
              </span>
            )}
            <span className="text-xs text-[#8c7f6b]">{items.length} items</span>
            {items.length > 0 && (
              <button
                onClick={clearBoard}
                className="text-xs px-2.5 py-1 border border-[#2c2825] bg-[#f4efe6] hover:bg-[#2c2825] hover:text-[#fbf9f5] transition-colors shadow-sm"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </header>

      <main
        className="w-full min-h-screen relative pt-20"
        onDoubleClick={handleCanvasDoubleClick}
      >
        {items.length === 0 ? (
          <div className="fixed inset-0 flex items-center justify-center text-[#9c8f7b] text-sm pt-20 pointer-events-none">
            Board empty. Double-click anywhere to create a note or paste
            content.
          </div>
        ) : (
          items.map((item) => {
            const w = item.width || 280;
            const h = item.height || 200;
            const defaultTitle = item.type.toUpperCase();

            return (
              <div
                key={item.id}
                onMouseDown={(e) => handleMouseDownItem(item.id, e)}
                onDoubleClick={
                  item.type === "text"
                    ? (e) => handleDoubleClickText(item.id, e)
                    : (e) => e.stopPropagation()
                }
                style={{
                  left: `${item.x}px`,
                  top: `${item.y}px`,
                  width: `${w}px`,
                  height: `${h}px`,
                  zIndex: item.zIndex,
                  position: "absolute",
                  minWidth: `${MIN_WIDTH}px`,
                  maxWidth: `${MAX_WIDTH}px`,
                  minHeight: `${MIN_HEIGHT}px`,
                  maxHeight: `${MAX_HEIGHT}px`,
                }}
                className={`group border border-[#2c2825] bg-[#f4efe6] shadow-[3px_3px_0px_0px_rgba(44,40,37,0.15)] p-3 flex flex-col ${
                  editingId === item.id ? "ring-2 ring-[#786c56]" : ""
                }`}
              >
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#d8d0c1] text-[10px] text-[#786c56] shrink-0 cursor-grab active:cursor-grabbing select-none">
                  {renamingId === item.id ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      defaultValue={item.title || defaultTitle}
                      onBlur={() => handleFinishRename(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleFinishRename(item.id);
                      }}
                      className="font-mono text-[10px] px-1 border border-[#2c2825] outline-none bg-[#fbf9f5] text-[#2c2825] w-24"
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => handleStartRename(item.id, e)}
                      className="font-bold text-[#5c5243] hover:text-[#2c2825] cursor-pointer truncate max-w-[120px]"
                      title="Double-click to rename"
                    >
                      {item.title || defaultTitle}
                    </span>
                  )}

                  <div className="flex gap-2">
                    {item.type === "text" ? (
                      <button
                        onClick={(e) => copyTextToClipboard(item.content, e)}
                        className="hover:text-[#2c2825] font-semibold"
                      >
                        Copy
                      </button>
                    ) : (
                      <button
                        onClick={(e) => copyImageToClipboard(item.content, e)}
                        className="hover:text-[#2c2825] font-semibold"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden pr-1">
                  {item.type === "text" ? (
                    editingId === item.id ? (
                      <textarea
                        ref={editTextRef}
                        defaultValue={item.content}
                        onBlur={() => handleFinishEdit(item.id)}
                        className="w-full h-full font-mono text-xs p-1 border border-dashed border-[#a89d8b] outline-none resize-none bg-[#fbf9f5] text-[#2c2825]"
                        placeholder="Type something..."
                      />
                    ) : (
                      <p className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-[#2c2825] select-text cursor-text">
                        {item.content ? (
                          renderTextWithLinks(item.content)
                        ) : (
                          <span className="text-[#9c8f7b] italic">
                            Empty note. Double-click header or text to edit.
                          </span>
                        )}
                      </p>
                    )
                  ) : (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasMoved.current) {
                          setPreviewImage(item.content);
                        }
                      }}
                      className="w-full h-full flex items-center justify-center cursor-zoom-in group/img"
                    >
                      <img
                        src={item.content}
                        alt="Pasted thumbnail"
                        className="max-w-full max-h-full object-contain pointer-events-none group-hover/img:opacity-90"
                      />
                    </div>
                  )}
                </div>

                <div
                  onMouseDown={(e) => handleMouseDownResize(item.id, e)}
                  className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-[#2c2825] opacity-20 group-hover:opacity-100 cursor-se-resize shrink-0"
                  title="Resize"
                />
              </div>
            );
          })
        )}
      </main>

      <div
        ref={shredderRef}
        className={`fixed bottom-6 right-6 w-36 h-36 border-2 border-dashed flex flex-col items-center justify-center transition-all z-[9999] select-none shadow-md ${
          isOverShredder
            ? "border-red-700 bg-red-50 text-red-700 scale-105 shadow-xl"
            : "border-[#a89d8b] bg-[#f4efe6]/90 backdrop-blur text-[#786c56]"
        }`}
      >
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-center">
          {isOverShredder ? "Release to Shred" : "Shredder Box"}
        </span>
      </div>

      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[999999] bg-[#2c2825]/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 cursor-zoom-out select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mb-4 flex items-center gap-4 bg-[#fbf9f5] text-[#2c2825] px-4 py-2 border border-[#2c2825] shadow-lg cursor-default"
          >
            <button
              onClick={() => copyImageToClipboard(previewImage)}
              className="text-xs font-semibold px-3 py-1 border border-[#2c2825] bg-[#f4efe6] hover:bg-[#2c2825] hover:text-[#fbf9f5] transition-colors"
            >
              Copy Image to Clipboard
            </button>
            <button
              onClick={() => setPreviewImage(null)}
              className="text-xs text-[#786c56] hover:text-[#2c2825] font-bold"
            >
              Close (Esc)
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-[90vw] max-h-[80vh] border border-[#fbf9f5] bg-[#f4efe6] p-2 shadow-2xl cursor-default"
          >
            <img
              src={previewImage}
              alt="Large Preview"
              className="max-w-full max-h-[75vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
