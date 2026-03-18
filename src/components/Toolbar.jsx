import React from 'react';
import { Loader2, Link2, BookOpen, Tag, Sparkles } from 'lucide-react';

export default function Toolbar({ aiLoading, blocksCount, handleAIGenerate }) {
  return (
    <div id="tour-ai-toolbar" className="flex items-center gap-1.5 flex-shrink-0 overflow-x-auto no-scrollbar scroll-smooth">
      <button 
        onClick={() => handleAIGenerate('autolink')} 
        disabled={aiLoading || blocksCount === 0} 
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-[#808080] hover:text-[#EBEBEB] hover:bg-[#2a2a2a] rounded-md transition-colors disabled:opacity-40"
      >
        {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
        <span className="hidden lg:inline">Auto-Link</span>
      </button>
      <button 
        onClick={() => handleAIGenerate('summarize')} 
        disabled={aiLoading || blocksCount === 0} 
        className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-[#808080] hover:text-[#EBEBEB] hover:bg-[#2a2a2a] rounded-md transition-colors disabled:opacity-40"
      >
        <BookOpen className="w-3.5 h-3.5" /> Summarize
      </button>
      <button 
        onClick={() => handleAIGenerate('tags')} 
        disabled={aiLoading || blocksCount === 0} 
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-[#808080] hover:text-[#EBEBEB] hover:bg-[#2a2a2a] rounded-md transition-colors disabled:opacity-40"
      >
        <Tag className="w-3.5 h-3.5" /> Auto-Tag
      </button>
      <button 
        onClick={() => handleAIGenerate('expand')} 
        disabled={aiLoading || blocksCount === 0} 
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-amber-500/80 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors disabled:opacity-40 sm:mr-2"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Ask AI</span>
      </button>
    </div>
  );
}
