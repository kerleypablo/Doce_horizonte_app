import { useState } from 'react';

export const TagInput = ({ value, onChange, placeholder }: { value: string[]; onChange: (value: string[]) => void; placeholder?: string }) => {
  const [text, setText] = useState('');

  const addTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean) return;
    if (value.includes(clean)) return;
    onChange([...value, clean]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(text.replace(',', ''));
      setText('');
    }
  };

  return (
    <div className="tag-input">
      <div className="tag-list">
        {value.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remover ${tag}`}>
              x
            </button>
          </span>
        ))}
        <input
          value={text}
          placeholder={placeholder ?? 'Digite e pressione Enter'}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};
