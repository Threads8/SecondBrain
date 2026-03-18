import React from 'react';
import { Zap, X, Search, Loader2, BrainCircuit, Plus, Network, Trash2, Play, HelpCircle, Sparkles, BookText } from 'lucide-react';

export default function Sidebar({
  isSidebarOpen,
  setIsSidebarOpen,
  searchQuery,
  setSearchQuery,
  isSemanticSearch,
  setIsSemanticSearch,
  isSearchingAI,
  filteredNotes,
  activeNoteId,
  handleCreateNote,
  handleNoteSelect,
  deleteNote,
  view,
  setView,
  startTutorial,
  setIsHelpModalOpen,
  setIsAskAIOpen
}) {
  return (
    <div className={`${isSidebarOpen ? 'translate-x-0 w-[260px] opacity-100' : '-translate-x-full w-0 opacity-0 overflow-hidden'} transition-all duration-300 ease-out fixed md:relative z-[50] h-full flex-shrink-0 bg-[#202020] flex flex-col shadow-2xl md:shadow-none border-r border-[#2f2f2f]`}>
      <div className="p-4 flex-shrink-0">
        <div 
          className="flex items-center gap-2 mb-6 px-1 cursor-pointer group"
          onClick={() => setIsSidebarOpen(false)}
          title="Hide Sidebar"
        >
          <div className="w-6 h-6 bg-indigo-500 rounded flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-[#EBEBEB] group-hover:text-white transition-colors">Second Brain</span>
        </div>
        <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1.5 text-[#808080] hover:bg-[#2a2a2a] hover:text-white rounded-md transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action / Search Area */}
      <div className="px-3 pt-4 pb-2 space-y-3">
        <div id="tour-search" className="relative group flex items-center">
          {isSearchingAI ? (
            <Loader2 className="w-3.5 h-3.5 absolute left-3 text-neutral-400 animate-spin" />
          ) : (
            <Search className={`w-3.5 h-3.5 absolute left-3 ${isSemanticSearch ? 'text-indigo-400' : 'text-[#606060] group-focus-within:text-white transition-colors'}`} />
          )}

          <input
            type="text"
            placeholder={isSemanticSearch ? "Ask AI meaning..." : "Search..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full bg-[#2a2a2a] border rounded-md pl-9 pr-8 py-1.5 text-[13px] font-medium focus:outline-none transition-all placeholder:text-[#606060] ${isSemanticSearch ? 'border-indigo-500/30 text-indigo-100 bg-[#2a2a3a]' : 'border-transparent focus:border-[#404040] text-white hover:bg-[#303030]'}`}
          />
          <button
            onClick={() => setIsSemanticSearch(!isSemanticSearch)}
            title={isSemanticSearch ? "Disable Semantic Search" : "Enable AI Semantic Search"}
            className={`absolute right-1.5 p-1 rounded-sm transition-all ${isSemanticSearch ? 'text-indigo-400 hover:text-indigo-300 scale-105' : 'text-[#606060] hover:bg-[#3a3a3a] hover:text-white'}`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
          </button>
        </div>
        
        {isSearchingAI && (
          <p className="text-[11px] font-medium text-neutral-400 ml-1 flex items-center gap-1.5 animate-pulse">
            <Sparkles className="w-2.5 h-2.5" /> semantic matching...
          </p>
        )}

        <div className="flex gap-1.5">
          <button id="tour-new-note" onClick={handleCreateNote} className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-neutral-200 text-black py-1.5 rounded-md text-[13px] font-medium transition-all shadow-sm active:scale-[0.98]">
            <Plus className="w-3.5 h-3.5" /> New Note
          </button>
          <button id="tour-graph-toggle" onClick={() => setView(view === 'graph' ? 'editor' : 'graph')} className={`p-1.5 rounded-md border transition-all ${view === 'graph' ? 'bg-[#3a3a3a] border-[#404040] text-white shadow-inner' : 'bg-[#2a2a2a] border-transparent text-[#808080] hover:text-white hover:bg-[#303030]'}`} title="Knowledge Graph">
            <Network className="w-4 h-4" />
          </button>
        </div>
        <button 
          onClick={() => setIsAskAIOpen(true)} 
          className="w-full mt-2 flex items-center justify-center gap-1.5 bg-[#1f1f1f] hover:bg-[#252525] border border-[#333] hover:border-[#444] text-[#EBEBEB] py-1.5 rounded-md text-[13px] font-medium transition-all shadow-sm group"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-300 transition-colors" /> 
          BrainAi
          <span className="text-[9px] font-mono text-[#808080] bg-[#111] px-1 py-0.5 rounded ml-1 border border-[#222]">⌘J</span>
        </button>
      </div>

      <div className="px-4 pb-1 mt-4">
        <h3 className="text-[11px] font-semibold text-[#808080] uppercase tracking-wider">Private</h3>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto scroll-smooth px-2 pb-4 space-y-0.5 custom-scrollbar">
        {filteredNotes.length === 0 ? (
          <div className="text-center text-[13px] text-[#606060] mt-6 flex flex-col items-center">
            <BookText className="w-6 h-6 text-[#404040] mb-2" />
            <p className="font-medium text-[#808080]">No pages found</p>
          </div>
        ) : (
          filteredNotes.map(note => (
            <div
              key={note.id}
              onClick={() => handleNoteSelect(note.id)}
              className={`
                group px-2 py-1.5 rounded-md cursor-pointer transition-colors flex items-center justify-between
                ${activeNoteId === note.id && view === 'editor'
                  ? 'bg-[#2f2f2f] text-white'
                  : 'bg-transparent text-[#a0a0a0] hover:bg-[#2a2a2a]'}
              `}
            >
              <div className="flex flex-col min-w-0 flex-1 pr-2">
                <span className={`text-[14px] truncate leading-tight font-medium ${activeNoteId === note.id && view === 'editor' ? 'text-[#EBEBEB]' : 'text-[#a0a0a0] group-hover:text-[#EBEBEB]'}`}>
                  {note.title || 'Untitled'}
                </span>
                
                {(note.tags?.length > 0 || note.links?.length > 0) && (
                  <div className="flex items-center gap-1.5 mt-1 opacity-60">
                    {note.tags?.slice(0, 1).map(tag => (
                      <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-[#3a3a3a] text-[#EBEBEB] border border-[#404040] max-w-[60px] truncate">
                        {tag}
                      </span>
                    ))}
                    {note.tags?.length > 1 && <span className="text-[9px] text-[#808080]">+{note.tags.length - 1}</span>}
                    {note.links?.length > 0 && (
                      <span className="flex items-center text-[9px] text-[#808080]">
                        <Network className="w-2.5 h-2.5 mr-0.5" /> {note.links.length}
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <button
                onClick={(e) => { e.stopPropagation(); deleteNote(note.id); if (activeNoteId === note.id) setActiveNoteId(null); }}
                className="opacity-0 group-hover:opacity-100 p-1 text-[#606060] hover:text-red-400 hover:bg-[#3a3a3a] transition-all rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-[#2f2f2f] flex-shrink-0 flex flex-col gap-1">
        <button
          onClick={startTutorial}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-[13px] font-medium text-[#808080] hover:text-white hover:bg-[#2a2a2a] rounded-md transition-colors"
        >
          <Play className="w-3.5 h-3.5" /> Quick Tour
        </button>
        <button
          onClick={() => setIsHelpModalOpen(true)}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-[13px] font-medium text-[#808080] hover:text-white hover:bg-[#2a2a2a] rounded-md transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" /> About & Manual
        </button>
      </div>
    </div>
  );
}
