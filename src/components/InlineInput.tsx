import React, { useState, useEffect, useRef } from "react";

type InlineInputProps = {
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
};

export default function InlineInput({
  defaultValue = "",
  placeholder = "",
  onConfirm,
  onCancel,
  autoFocus = true,
}: InlineInputProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (value.trim()) {
        onConfirm(value.trim());
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 0", alignItems: "center" }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: "4px 8px",
          border: "1px solid #555",
          borderRadius: 4,
          background: "#2a2a2a",
          color: "#f2f2f2",
          fontSize: 13,
        }}
      />
      <button
        type="button"
        onClick={() => value.trim() && onConfirm(value.trim())}
        disabled={!value.trim()}
        style={{
          padding: "4px 12px",
          fontSize: 12,
          background: value.trim() ? "#4ea1ff" : "#444",
          color: value.trim() ? "#fff" : "#888",
          border: "none",
          borderRadius: 4,
          cursor: value.trim() ? "pointer" : "not-allowed",
        }}
      >
        ✓
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: "4px 12px",
          fontSize: 12,
          background: "#444",
          color: "#f2f2f2",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
