import React, { useState, useEffect, useRef } from 'react';
import { 
  X, AtSign, Paperclip, Glasses, Globe, ChevronRight, Search, 
  ListOrdered, FileText, CheckCircle2, Package, Loader2, Bot, Sparkles
} from 'lucide-react';
import { callNvidiaAPI, blocksToMarkdown } from '../utils';

export default function AskAIModal({ isOpen, onClose, notes }) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [response, setResponse] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [selectedContextIds, setSelectedContextIds] = useState([]);
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setPrompt('');
      setResponse('');
      setHasSearched(false);
      setShowContextDropdown(false);
      setSelectedContextIds([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setHasSearched(true);
    setResponse('');

    try {
      const selectedNotes = selectedContextIds.length > 0 
        ? notes.filter(n => selectedContextIds.includes(n.id))
        : notes.slice(0, 5); // Fallback to 5 most recent if none selected explicitly

      const contextDocs = selectedNotes.map(n => `Title: ${n.title}\nContent: ${blocksToMarkdown(n.blocks || [])}`).join('\n\n---');
      
      const fullPrompt = `You are a highly intelligent semantic assistant called "Second Brain AI".
You are helping the user interactively inside a spotlight search modal.
Format your response purely in Markdown, concisely and beautifully.

Context provided from the user's workspace:
${contextDocs}

User Request:
${prompt}`;

      const resText = await callNvidiaAPI(fullPrompt);
      setResponse(resText);
    } catch (err) {
      setResponse(`**Error**: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDownInput = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleContext = (id) => {
    setSelectedContextIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a]/80 backdrop-blur-md flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-300 font-sans" onClick={onClose}>
      
      {/* Modal Container */}
      <div 
        ref={modalRef}
        className={`w-full max-w-[700px] flex flex-col transition-all duration-500 ease-out transform pointer-events-auto ${hasSearched ? '-translate-y-8' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        
        {!hasSearched && (
          <div className="flex flex-col items-center mb-8 animate-in slide-in-from-bottom-4 duration-500 ease-out">
            <div className="w-16 h-16 bg-[#1f1f1f] border border-[#2f2f2f] rounded-full flex items-center justify-center shadow-xl mb-6 relative">
              <Bot className="w-8 h-8 text-neutral-200" />
              <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-indigo-500 rounded-full border-2 border-[#1f1f1f]"></div>
            </div>
            <h1 className="text-[24px] sm:text-[32px] font-bold text-white tracking-tight">How can I help you today?</h1>
          </div>
        )}

        {/* Input Box Area */}
        <div className={`bg-[#151515] border ${hasSearched ? 'border-[#3a3a3a] mb-6' : 'border-[#2f2f2f]'} rounded-xl p-2.5 pb-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] transition-all duration-300 relative`}>
          
          {/* Top Pill inside Input */}
          <div className="flex flex-wrap items-center gap-2 px-2 pt-1 mb-2 relative">
            <button 
              onClick={() => setShowContextDropdown(!showContextDropdown)}
              className={`flex items-center gap-1.5 px-3 py-1 hover:bg-[#303030] hover:text-white rounded-full text-[12px] font-medium transition-colors border ${showContextDropdown || selectedContextIds.length > 0 ? 'bg-[#303030] text-white border-[#444]' : 'bg-[#252525] text-[#a0a0a0] border-[#333]'}`}
            >
              <AtSign className="w-3.5 h-3.5" />
              Add context {selectedContextIds.length > 0 && `(${selectedContextIds.length})`}
            </button>

            {/* Render selected pills */}
            {selectedContextIds.map(id => {
              const n = notes.find(x => x.id === id);
              if (!n) return null;
              return (
                <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded-full text-[12px] font-medium shadow-sm">
                  <FileText className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{n.title || 'Untitled'}</span>
                  <button onClick={() => toggleContext(id)} className="hover:text-white ml-0.5"><X className="w-3 h-3"/></button>
                </div>
              );
            })}

            {/* Context Dropdown absolute anchored */}
            {showContextDropdown && (
              <div className="absolute top-full left-2 mt-2 w-64 max-h-48 overflow-y-auto custom-scrollbar bg-[#1f1f1f] border border-[#2f2f2f] rounded-lg shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-2 text-xs font-bold text-[#808080] uppercase tracking-wider border-b border-[#2f2f2f] sticky top-0 bg-[#1f1f1f] z-10">Select Notes</div>
                {notes.length === 0 ? (
                  <div className="p-3 text-sm text-[#606060] text-center">No notes available</div>
                ) : (
                  <div className="p-1.5 space-y-0.5">
                    {notes.map(n => (
                      <button 
                        key={n.id}
                        onClick={() => toggleContext(n.id)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left text-[13px] transition-colors ${selectedContextIds.includes(n.id) ? 'bg-indigo-500/20 text-white' : 'text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-[#EBEBEB]'}`}
                      >
                        <span className="truncate">{n.title || 'Untitled'}</span>
                        {selectedContextIds.includes(n.id) && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <textarea
            ref={inputRef}
            placeholder="Ask anything or type a prompt..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDownInput}
            className="w-full bg-transparent text-white text-[17px] focus:outline-none min-h-[50px] resize-none px-3 py-1 placeholder:text-[#505050] custom-scrollbar"
            rows="1"
            onClick={() => setShowContextDropdown(false)}
          />

          {/* Action Strip inside Input */}
          <div className="flex items-center justify-end border-t border-[#252525] pt-2 px-1 mt-1">
            <button 
              onClick={handleSubmit}
              disabled={!prompt.trim() || isGenerating}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${prompt.trim() && !isGenerating ? 'bg-white text-black hover:bg-neutral-200 cursor-pointer shadow-lg' : 'bg-[#252525] text-[#606060] cursor-not-allowed'}`}
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-5 h-5 ml-0.5" />}
            </button>
          </div>
        </div>

        {/* AI Response Area */}
        {hasSearched && (
          <div className="w-full bg-[#151515] border border-[#2f2f2f] rounded-xl p-6 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#252525]">
              <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
              <span className="text-sm font-semibold tracking-wide text-neutral-300">AI RESPONSE</span>
            </div>
            
            {isGenerating && !response ? (
              <div className="flex flex-col space-y-3 pt-2">
                <div className="h-4 bg-[#252525] rounded-md w-3/4 animate-pulse"></div>
                <div className="h-4 bg-[#252525] rounded-md w-5/6 animate-pulse"></div>
                <div className="h-4 bg-[#252525] rounded-md w-1/2 animate-pulse"></div>
              </div>
            ) : null}

            {response && (
              <div 
                className="prose prose-invert prose-sm max-w-none text-[#d4d4d4] marker:text-indigo-400 prose-a:text-indigo-400 hover:prose-a:text-indigo-300 prose-code:bg-[#252525] prose-code:text-indigo-300 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none custom-scrollbar overflow-y-auto max-h-[50vh] pr-2"
                dangerouslySetInnerHTML={{ __html: response.replace(/\n/g, '<br/>') }} // Simple rendering for now, could use a markdown parser if preferred
              />
            )}
            
            {!isGenerating && response && (
               <div className="flex justify-end mt-4 pt-3 border-t border-[#252525]">
                  <button onClick={() => setHasSearched(false)} className="text-xs text-[#606060] hover:text-[#a0a0a0] transition-colors">Clear Conversation</button>
               </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
