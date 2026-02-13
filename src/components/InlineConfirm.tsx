import React from "react";

type InlineConfirmProps = {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

export default function InlineConfirm({
  message,
  onConfirm,
  onCancel,
  confirmText = "Yes",
  cancelText = "No",
  danger = false,
}: InlineConfirmProps) {
  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ fontSize: 13, marginBottom: 8, color: danger ? "#ff6b6b" : "#f2f2f2" }}>
        {message}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: "6px 12px",
            fontSize: 13,
            background: danger ? "#d32f2f" : "#4ea1ff",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          {confirmText}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "6px 12px",
            fontSize: 13,
            background: "#444",
            color: "#f2f2f2",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          {cancelText}
        </button>
      </div>
    </div>
  );
}
