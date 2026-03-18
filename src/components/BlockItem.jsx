import React, { useRef, useEffect } from 'react';
import { GripVertical, CheckCircle2 } from 'lucide-react';

export default function BlockItem({
  block, index, isFocused, onChange, onKeyDown, onAddBlock, onDeleteBlock, onFocus,
  onDragStart, onDragOver, onDrop, onDragEnter, onDragLeave
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isFocused && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isFocused]);

  useEffect(() => {
    if (textareaRef.current && block.type !== 'divider') {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [block.content, block.type]);

  const handleInput = (e) => {
    onChange(block.id, { content: e.target.value });
  };

  const handleLocalKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onAddBlock(index);
    } else if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault();
      onDeleteBlock(block.id, index);
    } else {
      onKeyDown(e, block.id, index);
    }
  };

  let baseClasses = "w-full bg-transparent resize-none focus:outline-none placeholder:text-[#3a3a3a] overflow-hidden break-words transition-colors ";
  if (block.type === 'h1') baseClasses += "text-[32px] font-bold text-[#EBEBEB] mt-6 mb-2 leading-tight";
  else if (block.type === 'h2') baseClasses += "text-[24px] font-semibold text-[#EBEBEB] mt-5 mb-1 leading-snug";
  else if (block.type === 'ul') baseClasses += "text-[15px] text-[#D4D4D4] py-1 translate-y-[-2px]";
  else if (block.type === 'todo') baseClasses += "text-[15px] text-[#D4D4D4] py-1 translate-y-[-2px]";
  else if (block.type === 'code') baseClasses += "text-[13px] font-mono text-[#D4D4D4] bg-[#202020] rounded-md p-4 my-2 leading-relaxed";
  else if (block.type === 'divider') baseClasses += "hidden";
  else baseClasses += "text-[15px] text-[#D4D4D4] py-1 leading-relaxed";

  return (
    <div
      className="group flex items-start -ml-8 py-0.5 relative"
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={(e) => onDrop(e, index)}
      onDragEnter={() => onDragEnter(index)}
      onDragLeave={onDragLeave}
    >
      <div
        className="w-8 pt-[6px] opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-grab active:cursor-grabbing transition-opacity"
        draggable
        onDragStart={(e) => onDragStart(e, index)}
      >
        <div className="p-0.5 rounded-sm hover:bg-[#2a2a2a] transition-colors">
          <GripVertical className="w-4 h-4 text-[#606060]" />
        </div>
      </div>

      <div className="flex-1 flex items-start gap-2.5 relative min-w-0">
        {block.type === 'ul' && <div className="mt-3 w-1.5 h-1.5 rounded-full bg-[#EBEBEB] flex-shrink-0" />}
        {block.type === 'todo' && (
          <button
            onClick={() => onChange(block.id, { checked: !block.checked })}
            className={`mt-[6px] w-[15px] h-[15px] rounded-[3px] border flex items-center justify-center flex-shrink-0 transition-colors ${block.checked ? 'bg-[#2a2a2a] border-[#2a2a2a]' : 'border-[#404040] hover:border-[#808080]'}`}
          >
            {block.checked && <CheckCircle2 className="w-3 h-3 text-[#EBEBEB]" />}
          </button>
        )}

        {block.type === 'divider' ? (
          <div className="w-full h-px bg-[#2f2f2f] my-6" />
        ) : (
          <textarea
            id={`block-${block.id}`}
            ref={textareaRef}
            value={block.content}
            onChange={handleInput}
            onKeyDown={handleLocalKeyDown}
            onFocus={() => onFocus(block.id)}
            placeholder={block.type === 'p' ? "Type '/' for commands" : block.type}
            className={`${baseClasses} ${block.type === 'todo' && block.checked ? 'line-through text-[#606060]' : ''}`}
            rows={1}
            spellCheck="false"
          />
        )}
      </div>
    </div>
  );
}
