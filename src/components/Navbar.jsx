import React from 'react';
import { Save } from 'lucide-react';
import Toolbar from './Toolbar';

export default function Navbar({ 
  editTitle, 
  setEditTitle, 
  isSaving, 
  isLocalChangeRef,
  aiLoading,
  blocksCount,
  handleAIGenerate
}) {
  return (
    <div className="h-12 border-b border-[#2a2a2a] bg-[#191919] flex items-center justify-between px-4 sm:px-6 pl-14 md:pl-6 sticky top-0 z-10 transition-all flex-shrink-0">
      <div className="flex items-center gap-3 flex-1 mr-4 min-w-0 group">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => {
            isLocalChangeRef.current = true;
            setEditTitle(e.target.value);
          }}
          placeholder="Untitled"
          className="bg-transparent text-[14px] font-medium text-[#EBEBEB] placeholder:text-[#606060] focus:outline-none w-full max-w-[120px] sm:max-w-xs md:max-w-lg truncate transition-colors hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] px-2 py-1 rounded-md"
        />
        {isSaving && (
          <span className="flex items-center text-[11px] font-medium text-[#808080] flex-shrink-0 bg-[#2a2a2a] px-2 py-0.5 rounded-sm">
            <Save className="w-3 h-3 mr-1 animate-pulse" /> <span className="hidden sm:inline">Saving</span>
          </span>
        )}
      </div>

      <Toolbar 
        aiLoading={aiLoading} 
        blocksCount={blocksCount} 
        handleAIGenerate={handleAIGenerate} 
      />
    </div>
  );
}
