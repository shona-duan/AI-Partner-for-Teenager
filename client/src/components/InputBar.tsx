import {
  useState,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import type { TeacherRole } from "../types";
import "./InputBar.css";

const MAX_IMAGES = 5;

interface ImageItem {
  file: File;
  preview: string;
}

interface Props {
  onSend: (content: string, role: TeacherRole, images?: File[]) => void;
  isStreaming: boolean;
  onStop: () => void;
  currentRole: TeacherRole;
}

export default function InputBar({
  onSend,
  isStreaming,
  onStop,
  currentRole,
}: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isStreaming) return;
    if (!text.trim() && images.length === 0) return;

    const files = images.length > 0 ? images.map((img) => img.file) : undefined;
    onSend(text.trim(), currentRole, files);
    setText("");
    clearAllImages();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of files) {
      attachImage(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (currentRole !== "mentor") return;
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) attachImage(file);
        return;
      }
    }
  };

  const attachImage = (file: File) => {
    if (images.length >= MAX_IMAGES) return;
    setImages((prev) => [...prev, { file, preview: URL.createObjectURL(file) }]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAllImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <form className="input-bar" onSubmit={handleSubmit}>
      {images.length > 0 && (
        <div className="image-preview-row">
          {images.map((img, i) => (
            <div key={i} className="image-preview-container">
              <img src={img.preview} alt={`图片 ${i + 1}`} className="image-preview" />
              <button
                type="button"
                className="image-remove-btn"
                onClick={() => removeImage(i)}
              >
                ✕
              </button>
            </div>
          ))}
          <span className="image-count">
            {images.length}/{MAX_IMAGES}
          </span>
        </div>
      )}
      <div className="input-row">
        {currentRole === "mentor" && (
          <>
            <button
              type="button"
              className="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title={`上传作业图片（${images.length}/${MAX_IMAGES}）`}
              disabled={images.length >= MAX_IMAGES}
            >
              📷
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleImageSelect}
            />
          </>
        )}
        <textarea
          className="input-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            currentRole === "mentor"
              ? `描述你的问题，或粘贴/上传作业图片（最多 ${MAX_IMAGES} 张）...`
              : "输入你的问题...（Enter 发送，Shift+Enter 换行）"
          }
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button type="button" className="stop-btn" onClick={onStop}>
            ⏹
          </button>
        ) : (
          <button
            type="submit"
            className="send-btn"
            disabled={!text.trim() && images.length === 0}
          >
            ↑
          </button>
        )}
      </div>
    </form>
  );
}
