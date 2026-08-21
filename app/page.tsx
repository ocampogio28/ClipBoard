"use client";

import React, { useEffect, useState, useRef } from "react";
import { get, set } from "idb-keyval";

export type ClipboardItemData = {
  id: string;
  type: "text" | "image";
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

export default function VirtualClipboardPage() {
  const [items, setItems] = useState<ClipboardItemData[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const maxZIndex = useRef(1);

  // Movement & Resizing State
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStartDim = useRef({ w: 0, h: 0, x: 0, y: 0 });

  // Editing & Preview State
  const [editingId, setEditingId] = useState<string | null>(null);
  const editTextRef = useRef<HTMLTextAreaElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // 1. Load items from IndexedDB
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined" && navigator.storage?.persist) {
      navigator.storage.persist();
    }
    get<ClipboardItemData[]>(STORAGE_KEY).then((saved) => {
      if (saved && Array.isArray(saved)) {
        setItems(saved);
        const highestZ = saved.reduce((max, i) => Math.max(max, i.zIndex || 1), 1);
        maxZIndex.current = highestZ;
      }
    });
  }, []);

  const saveItems = (newItems: ClipboardItemData[]) => {
    setItems(newItems);
    set(STORAGE_KEY, newItems);
  };

  // 2. Global Paste Handler
  useEffect(() => {
    if (!isMounted) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (editingId) return;

      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const spawnX = 80 + (items.length % 8) * 30;
      const spawnY = 100 + (items.length % 8) * 30;
      maxZIndex.current += 1;

      for (const item of Array.from(clipboardItems)) {
        // Image Paste
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = (event) => {
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

        // Text Paste
        if (item.type === "text/plain") {
          item.getAsString((text) => {
            if (!text.trim()) return;
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
  }, [isMounted, items.length, editingId]);

  // 3. Movement
  const handleMouseDownItem = (id: string, e: React.MouseEvent) => {
    if (editingId === id) return;
    e.stopPropagation();

    maxZIndex.current += 1;
    const updated = items.map((item) =>
      item.id === id ? { ...item, zIndex: maxZIndex.current } : item
    );
    const target = updated.find((i) => i.id === id);
    if (target) {
      dragOffset.current = { x: e.clientX - target.x, y: e.clientY - target.y };
      setDraggingId(id);
    }
    saveItems(updated);
  };

  // 4. Resizing
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
      const newX = Math.max(10, e.clientX - dragOffset.current.x);
      const newY = Math.max(70, e.clientY - dragOffset.current.y);
      setItems((prev) =>
        prev.map((item) =>
          item.id === draggingId ? { ...item, x: newX, y: newY } : item
        )
      );
    }

    if (resizingId) {
      const deltaX = e.clientX - resizeStartDim.current.x;
      const deltaY = e.clientY - resizeStartDim.current.y;

      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, resizeStartDim.current.w + deltaX)
      );
      const newHeight = Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, resizeStartDim.current.h + deltaY)
      );

      setItems((prev) =>
        prev.map((item) =>
          item.id === resizingId
            ? { ...item, width: newWidth, height: newHeight }
            : item
        )
      );
    }
  };

  const handleMouseUp = () => {
    if (draggingId || resizingId) {
      setDraggingId(null);
      setResizingId(null);
      set(STORAGE_KEY, items);
    }
  };

  // 5. Editing Text
  const handleDoubleClickText = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setTimeout(() => editTextRef.current?.focus(), 0);
  };

  const handleFinishEdit = (id: string) => {
    if (!editingId) return;
    const newContent = editTextRef.current?.value || "";
    const updated = items.map((item) =>
      item.id === id ? { ...item, content: newContent } : item
    );
    setEditingId(null);
    saveItems(updated);
  };

  // 6. Copy Back to Clipboard Utility
  const copyImageToClipboard = async (dataUrl: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
  };

  const copyTextToClipboard = async (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1500);
  };

  const deleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveItems(items.filter((item) => item.id !== id));
  };

  const clearBoard = () => saveItems([]);

  if (!isMounted) {
    return <div className="min-h-screen bg-white text-black p-6">Loading board...</div>;
  }

  return (
    <div
      className="min-h-screen bg-white text-black select-none relative overflow-auto"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Fixed Top Controls */}
      <header className="fixed top-0 left-0 right-0 h-14 border-b border-black/10 bg-white/80 backdrop-blur z-[99999] px-6 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Virtual Clipboard</h1>
          <p className="text-xs text-neutral-500">
            Paste (<kbd className="px-1 border rounded bg-neutral-100">Ctrl+V</kbd>), Click image to preview/copy, Dbl-click text to edit.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {copySuccess && (
            <span className="text-xs bg-black text-white px-2 py-0.5 font-mono">
              Copied to clipboard!
            </span>
          )}
          <span className="text-xs text-neutral-400">{items.length} items</span>
          {items.length > 0 && (
            <button
              onClick={clearBoard}
              className="text-xs px-2.5 py-1 border border-black hover:bg-black hover:text-white transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Main Canvas Area */}
      <main className="w-full min-h-screen relative pt-14">
        {items.length === 0 ? (
          <div className="fixed inset-0 flex items-center justify-center text-neutral-400 text-sm pt-14 pointer-events-none">
            Board empty. Paste text or images anywhere.
          </div>
        ) : (
          items.map((item) => {
            const w = item.width || 280;
            const h = item.height || 200;

            return (
              <div
                key={item.id}
                onMouseDown={(e) => handleMouseDownItem(item.id, e)}
                onDoubleClick={
                  item.type === "text"
                    ? (e) => handleDoubleClickText(item.id, e)
                    : undefined
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
                className={`group border border-black bg-white shadow-sm p-3 flex flex-col ${
                  editingId === item.id
                    ? "ring-2 ring-blue-500"
                    : "cursor-grab active:cursor-grabbing"
                }`}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-neutral-200 text-[10px] text-neutral-400 shrink-0">
                  <span>{item.type.toUpperCase()}</span>
                  <div className="flex gap-2">
                    {item.type === "text" ? (
                      <button
                        onClick={(e) => copyTextToClipboard(item.content, e)}
                        className="hover:text-black font-semibold"
                      >
                        Copy
                      </button>
                    ) : (
                      <button
                        onClick={(e) => copyImageToClipboard(item.content, e)}
                        className="hover:text-black font-semibold"
                      >
                        Copy
                      </button>
                    )}
                    <button
                      onClick={(e) => deleteItem(item.id, e)}
                      className="hover:text-red-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Card Content */}
                <div className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden pr-1">
                  {item.type === "text" ? (
                    editingId === item.id ? (
                      <textarea
                        ref={editTextRef}
                        defaultValue={item.content}
                        onBlur={() => handleFinishEdit(item.id)}
                        className="w-full h-full font-mono text-xs p-1 border border-dashed border-neutral-300 outline-none resize-none bg-neutral-50"
                      />
                    ) : (
                      <p className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-800 select-text">
                        {item.content}
                      </p>
                    )
                  ) : (
                    /* Image Thumbnail - Click to Preview */
                    <div
                      onClick={() => setPreviewImage(item.content)}
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

                {/* Resize Handle */}
                <div
                  onMouseDown={(e) => handleMouseDownResize(item.id, e)}
                  className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-black opacity-20 group-hover:opacity-100 cursor-se-resize shrink-0"
                  title="Resize"
                />
              </div>
            );
          })
        )}
      </main>

      {/* Image Preview & Action Overlay */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 cursor-zoom-out"
        >
          {/* Preview Toolbar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mb-4 flex items-center gap-4 bg-white text-black px-4 py-2 border border-black shadow-lg cursor-default"
          >
            <button
              onClick={() => copyImageToClipboard(previewImage)}
              className="text-xs font-semibold px-3 py-1 border border-black hover:bg-black hover:text-white transition-colors"
            >
              Copy Image to Clipboard
            </button>
            <button
              onClick={() => setPreviewImage(null)}
              className="text-xs text-neutral-500 hover:text-black font-bold"
            >
              Close (Esc)
            </button>
          </div>

          {/* Large Image Frame */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-[90vw] max-h-[80vh] border border-white bg-white/5 p-2 shadow-2xl cursor-default"
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