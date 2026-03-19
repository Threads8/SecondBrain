import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  AlertTriangle, X, Hash, Network, BrainCircuit, 
  Sparkles, Loader2, Type, Heading1, Heading2, 
  List as ListIcon, CheckSquare, Code, Minus 
} from 'lucide-react';
import BlockItem from './BlockItem';
import Navbar from './Navbar';
import {
  aiCache, callNvidiaAPI, safeParseJSONArray, generateId, 
  extractLinks, blocksToMarkdown, markdownToBlocks
} from '../utils';

const COMMANDS = [
  { icon: <Type className="w-4 h-4" />, label: 'Text', type: 'p' },
  { icon: <Heading1 className="w-4 h-4" />, label: 'Heading 1', type: 'h1' },
  { icon: <Heading2 className="w-4 h-4" />, label: 'Heading 2', type: 'h2' },
  { icon: <ListIcon className="w-4 h-4" />, label: 'Bulleted list', type: 'ul' },
  { icon: <CheckSquare className="w-4 h-4" />, label: 'To-do list', type: 'todo' },
  { icon: <Code className="w-4 h-4" />, label: 'Code', type: 'code' },
  { icon: <Minus className="w-4 h-4" />, label: 'Divider', type: 'divider' },
];

export default function Editor({ note, notes, updateNote, handlePreviewClick, handleNoteSelect }) {
  const [editTitle, setEditTitle] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [editTags, setEditTags] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [focusedBlockId, setFocusedBlockId] = useState(null);

  const isLocalChangeRef = useRef(false);
  const prevNoteIdRef = useRef(null);

  const [slashMenu, setSlashMenu] = useState({ active: false, x: 0, y: 0, filter: '', index: 0, blockId: null });
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [relatedNotes, setRelatedNotes] = useState([]);
  const [isRelatedLoading, setIsRelatedLoading] = useState(false);

  useEffect(() => {
    if (!note) return;

    if (note.id !== prevNoteIdRef.current || !isLocalChangeRef.current) {
      setEditTitle(note.title || '');
      setEditTags(note.tags || []);

      let initialBlocks;
      if (note.blocks && note.blocks.length > 0) {
        initialBlocks = note.blocks;
      } else {
        initialBlocks = markdownToBlocks(note.content);
      }

      setBlocks(initialBlocks);

      if (note.id !== prevNoteIdRef.current) {
        fetchRelatedNotes(note, initialBlocks);
      }
    }

    prevNoteIdRef.current = note.id;
  }, [note]); 

  useEffect(() => {
    if (!note) return;

    const stripIds = (blks) => blks ? blks.map(({ id, ...rest }) => rest) : [];

    const isTitleChanged = editTitle !== (note.title || '');
    const isTagsChanged = JSON.stringify(editTags) !== JSON.stringify(note.tags || []);

    const currentBlocksStr = JSON.stringify(stripIds(blocks));
    const dbBlocksStr = JSON.stringify(stripIds(note.blocks || markdownToBlocks(note.content)));
    const isBlocksChanged = currentBlocksStr !== dbBlocksStr;

    if (!isTitleChanged && !isTagsChanged && !isBlocksChanged) return;
    if (!isLocalChangeRef.current) return;

    const saveTimeout = setTimeout(async () => {
      setIsSaving(true);
      isLocalChangeRef.current = false;

      const mdContent = blocksToMarkdown(blocks);
      const extractedLinks = extractLinks(mdContent);
      await updateNote(note.id, {
        title: editTitle,
        content: mdContent, 
        blocks: blocks,    
        tags: editTags,
        links: extractedLinks
      });
      setIsSaving(false);
    }, 500);

    return () => clearTimeout(saveTimeout);
  }, [editTitle, blocks, editTags, note?.id]);

  const handleBlockChange = (id, changes) => {
    isLocalChangeRef.current = true; 
    setBlocks(prev => {
      const newBlocks = [...prev];
      const idx = newBlocks.findIndex(b => b.id === id);
      if (idx > -1) {
        newBlocks[idx] = { ...newBlocks[idx], ...changes };
        const content = newBlocks[idx].content;
        const slashIndex = content.lastIndexOf('/');
        if (slashIndex > -1 && slashIndex === content.length - 1) {
          const el = document.getElementById(`block-${id}`);
          if (el) setSlashMenu({ active: true, filter: '', index: 0, blockId: id });
        } else if (slashMenu.active && slashMenu.blockId === id) {
          if (slashIndex === -1) setSlashMenu(s => ({ ...s, active: false }));
          else setSlashMenu(s => ({ ...s, filter: content.slice(slashIndex + 1).toLowerCase() }));
        }
      }
      return newBlocks;
    });
  };

  const handleAddBlock = (index) => {
    isLocalChangeRef.current = true; 
    setBlocks(prev => {
      const newBlocks = [...prev];
      const newId = generateId();
      newBlocks.splice(index + 1, 0, { id: newId, type: 'p', content: '' });
      setFocusedBlockId(newId);
      return newBlocks;
    });
    setSlashMenu(s => ({ ...s, active: false }));
  };

  const handleDeleteBlock = (id, index) => {
    if (blocks.length <= 1) return; 
    isLocalChangeRef.current = true; 
    setBlocks(prev => {
      const newBlocks = [...prev];
      newBlocks.splice(index, 1);
      if (index > 0) setFocusedBlockId(newBlocks[index - 1].id);
      else setFocusedBlockId(newBlocks[0].id);
      return newBlocks;
    });
    setSlashMenu(s => ({ ...s, active: false }));
  };

  const handleKeyDown = (e, id, index) => {
    if (slashMenu.active) {
      const filteredCommands = COMMANDS.filter(c => c.label.toLowerCase().includes(slashMenu.filter));
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashMenu(s => ({ ...s, index: (s.index + 1) % filteredCommands.length })); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashMenu(s => ({ ...s, index: (s.index - 1 + filteredCommands.length) % filteredCommands.length })); return; }
      if (e.key === 'Enter') { e.preventDefault(); applySlashCommand(filteredCommands[slashMenu.index].type); return; }
      if (e.key === 'Escape') { setSlashMenu(s => ({ ...s, active: false })); return; }
    }

    if (e.key === 'ArrowUp' && index > 0 && e.target.selectionStart === 0) { e.preventDefault(); setFocusedBlockId(blocks[index - 1].id); }
    if (e.key === 'ArrowDown' && index < blocks.length - 1 && e.target.selectionStart === e.target.value.length) { e.preventDefault(); setFocusedBlockId(blocks[index + 1].id); }
  };

  const applySlashCommand = (type) => {
    isLocalChangeRef.current = true; 
    setBlocks(prev => {
      const newBlocks = [...prev];
      const idx = newBlocks.findIndex(b => b.id === slashMenu.blockId);
      if (idx > -1) {
        let content = newBlocks[idx].content;
        const slashIdx = content.lastIndexOf('/');
        if (slashIdx > -1) content = content.slice(0, slashIdx);
        newBlocks[idx] = { ...newBlocks[idx], type, content };
        if (type === 'divider') {
          const newId = generateId();
          newBlocks.splice(idx + 1, 0, { id: newId, type: 'p', content: '' });
          setFocusedBlockId(newId);
        }
      }
      return newBlocks;
    });
    setSlashMenu(s => ({ ...s, active: false }));
  };

  const handleDragStart = (e, index) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (index) => { if (draggedIndex === null || draggedIndex === index) return; setDragOverIndex(index); };
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) { setDraggedIndex(null); setDragOverIndex(null); return; }
    isLocalChangeRef.current = true; 
    setBlocks(prev => {
      const newBlocks = [...prev];
      const [draggedBlock] = newBlocks.splice(draggedIndex, 1);
      newBlocks.splice(dropIndex, 0, draggedBlock);
      return newBlocks;
    });
    setDraggedIndex(null); setDragOverIndex(null);
  };

  const fetchRelatedNotes = async (currentNote, currentBlocks) => {
    if (!currentNote.title && (!currentBlocks || currentBlocks.length === 0)) return;
    if (notes.length <= 1) return;

    setIsRelatedLoading(true);
    const cacheKey = `related_${currentNote.id}_${currentNote.updatedAt?.toMillis?.() || 'new'}`;

    if (aiCache.has(cacheKey)) { setRelatedNotes(aiCache.get(cacheKey)); setIsRelatedLoading(false); return; }

    try {
      const payload = notes.filter(n => n.id !== currentNote.id).map(n => ({ id: n.id, title: n.title, tags: n.tags }));
      const mdContent = blocksToMarkdown(currentBlocks);
      const prompt = `You are an AI recommendation engine. Find the top 3 related notes based on semantics. Current Note: Title: "${currentNote.title}", Content snippet: "${mdContent.substring(0, 300)}". Available Notes: ${JSON.stringify(payload)}. Respond ONLY with a valid JSON array of related note IDs. Example: ["id1", "id2"]`;
      const result = await callNvidiaAPI(prompt);
      const ids = safeParseJSONArray(result);
      if (Array.isArray(ids)) { aiCache.set(cacheKey, ids); setRelatedNotes(ids); }
    } catch (e) { console.warn("Background AI fetch:", e); } finally { setIsRelatedLoading(false); }
  };

  const handleAIGenerate = async (action) => {
    const mdContent = blocksToMarkdown(blocks);
    if (!mdContent.trim()) return;
    setAiLoading(true); setAiError(null);
    try {
      if (action === 'summarize') {
        const result = await callNvidiaAPI(`Summarize concisely:\n\n${mdContent}`);
        isLocalChangeRef.current = true; 
        setBlocks(prev => [...prev, { id: generateId(), type: 'divider', content: '' }, ...markdownToBlocks(`## Summary\n${result}`)]);
      } else if (action === 'tags') {
        const result = await callNvidiaAPI(`Suggest 3-5 tags, strictly CSV:\n\n${mdContent}`);
        const newTags = result.split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9]/g, '')).filter(t => t);
        isLocalChangeRef.current = true; 
        setEditTags(prev => [...new Set([...prev, ...newTags])].slice(0, 10));
      } else if (action === 'expand') {
        const result = await callNvidiaAPI(`Expand on this text in detail:\n\n${mdContent}`);
        isLocalChangeRef.current = true; 
        setBlocks(prev => [...prev, { id: generateId(), type: 'divider', content: '' }, ...markdownToBlocks(`## Expansion\n${result}`)]);
      } else if (action === 'autolink') {
        const noteTitles = notes.filter(n => n.id !== note.id && n.title).map(n => n.title);
        if (noteTitles.length === 0) throw new Error("No other notes exist.");
        const result = await callNvidiaAPI(`Find words in text matching exactly these titles: ${JSON.stringify(noteTitles)}. Return JSON: [{"phrase": "word", "title": "Title"}]. Text: ${mdContent}`);
        const matches = safeParseJSONArray(result); 
        if (!Array.isArray(matches) || matches.length === 0) throw new Error("No matches found.");
        let linksAdded = 0;
        isLocalChangeRef.current = true; 
        setBlocks(prev => prev.map(b => {
          if (b.type !== 'p' && b.type !== 'h1' && b.type !== 'h2' && b.type !== 'ul' && b.type !== 'todo') return b;
          let newContent = b.content;
          matches.forEach(match => {
            if (!match || !match.phrase || !match.title || match.phrase.trim() === '') return; 
            try {
              const safePhrase = match.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`(\\[\\[.*?\\]\\])|\\b(${safePhrase})\\b`, 'gi');
              newContent = newContent.replace(regex, (fullMatch, isLink, isPhrase) => {
                if (isLink) return fullMatch; 
                if (isPhrase) { linksAdded++; return `[[${match.title}]]`; }
                return fullMatch;
              });
            } catch (err) {}
          });
          return { ...b, content: newContent };
        }));
        if (linksAdded === 0) throw new Error("No unlinked phrases found.");
      }
    } catch (err) { setAiError(err.message || "Failed to fetch from AI API. Please try again."); setTimeout(() => setAiError(null), 8000); } finally { setAiLoading(false); }
  };

  const backlinks = useMemo(() => {
    if (!note?.title) return [];
    return notes.filter(n => n.id !== note.id && n.links?.some(link => link.toLowerCase().trim() === note.title.toLowerCase().trim()));
  }, [note?.title, note?.id, notes]);

  const populatedRelatedNotes = useMemo(() => relatedNotes.map(id => notes.find(n => n.id === id)).filter(Boolean), [relatedNotes, notes]);

  if (!note) return null;
  const filteredCommands = COMMANDS.filter(c => c.label.toLowerCase().includes(slashMenu.filter));

  return (
    <div className="flex-1 flex flex-col h-full relative" style={{ backgroundColor: '#191919' }}>
      {aiError && (
        <div className="absolute bottom-8 right-8 z-20 max-w-sm bg-[#2a2a2a] border border-[#3a3a3a] text-red-400 px-4 py-3 rounded-lg text-[13px] flex items-start gap-3 shadow-2xl animate-in slide-in-from-bottom-5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="font-medium leading-relaxed">{aiError}</p>
          <button onClick={() => setAiError(null)} className="p-1 hover:bg-[#333333] rounded-sm transition-colors"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <Navbar 
        editTitle={editTitle} setEditTitle={setEditTitle} isSaving={isSaving} isLocalChangeRef={isLocalChangeRef}
        aiLoading={aiLoading} blocksCount={blocks.length} handleAIGenerate={handleAIGenerate}
      />

      {editTags.length > 0 && (
        <div className="px-6 sm:px-8 md:px-24 lg:px-48 py-2 flex gap-1.5 flex-wrap flex-shrink-0 pt-6 border-b border-[#2f2f2f]">
          {editTags.map(tag => (
            <span key={tag} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#2a2a2a] text-[#a0a0a0] border border-transparent hover:border-[#404040] transition-colors">
              {tag}
              <button
                onClick={() => { isLocalChangeRef.current = true; setEditTags(tags => tags.filter(t => t !== tag)); }}
                className="ml-1 text-[#606060] hover:text-[#EBEBEB] transition-colors"><X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div id="tour-editor" className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar p-6 sm:p-8 md:px-24 lg:px-48 pb-64">
        <div className="max-w-[708px] mx-auto relative pt-4">

          {/* Title Area - Notion Style Massive Title */}
          <input
            type="text"
            value={editTitle}
            onChange={(e) => { isLocalChangeRef.current = true; setEditTitle(e.target.value); }}
            placeholder="Untitled"
            className="bg-transparent text-[32px] sm:text-[42px] font-bold text-[#EBEBEB] placeholder:text-[#3a3a3a] focus:outline-none w-full mb-8 leading-tight resize-none overflow-hidden"
          />

          {blocks.map((block, index) => (
            <div key={block.id} className="relative block-anim transition-transform duration-200">
              {dragOverIndex === index && <div className="absolute -top-[1px] left-0 right-0 h-[2px] bg-[#404040] rounded-full z-10" />}

              <BlockItem
                block={block} index={index} isFocused={focusedBlockId === block.id}
                onChange={handleBlockChange} onAddBlock={handleAddBlock} onDeleteBlock={handleDeleteBlock}
                onKeyDown={handleKeyDown} onFocus={setFocusedBlockId}
                onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                onDragEnter={() => setDragOverIndex(index)} onDragLeave={() => setDragOverIndex(null)}
              />

              {slashMenu.active && slashMenu.blockId === block.id && (
                <div className="absolute top-full left-0 z-50 mt-1 w-[280px] bg-[#252525] border border-[#3a3a3a] rounded-lg shadow-xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100 origin-top-left">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-[#808080] uppercase tracking-wider mb-1">Basic blocks</div>
                  {filteredCommands.length > 0 ? (
                    filteredCommands.map((cmd, cmdIdx) => (
                      <button
                        key={cmd.type} onClick={() => applySlashCommand(cmd.type)}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors ${cmdIdx === slashMenu.index ? 'bg-[#333333] text-[#EBEBEB]' : 'text-[#a0a0a0] hover:bg-[#2a2a2a]'}`}
                      >
                        <div className="p-1 rounded-md bg-white/5 border border-white/5 text-[#D4D4D4]">{cmd.icon}</div>
                        <span className="font-medium">{cmd.label}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-[13px] text-[#606060] text-center">No blocks matches</div>
                  )}
                </div>
              )}
            </div>
          ))}

          {blocks.length === 0 && (
            <div onClick={() => handleAddBlock(-1)} className="h-64 w-full cursor-text text-[#3a3a3a] p-1 text-[15px]">Type '/' for commands</div>
          )}

          {(backlinks.length > 0 || populatedRelatedNotes.length > 0 || isRelatedLoading) && (
            <div className="mt-24 pt-8 border-t border-[#2f2f2f] flex flex-col gap-6">
              {backlinks.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-[#808080] uppercase tracking-wider mb-2">Backlinks</h4>
                  <div className="flex flex-col gap-1 inline-block">
                    {backlinks.map(bl => (
                      <button
                        key={bl.id} onClick={() => handleNoteSelect(bl.id)}
                        className="text-[14px] px-3 py-2 text-left bg-transparent hover:bg-[#2a2a2a] rounded-md transition-colors text-[#a0a0a0] hover:text-[#EBEBEB] border-b border-[#2f2f2f] hover:border-transparent flex items-center gap-2"
                      >
                         ↗ {bl.title || 'Untitled'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(populatedRelatedNotes.length > 0 || isRelatedLoading) && (
                <div>
                  <h4 className="text-[11px] font-semibold text-[#808080] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BrainCircuit className="w-3 h-3" /> AI Related topics
                  </h4>
                  {isRelatedLoading ? (
                    <div className="flex items-center gap-2 text-[13px] text-[#606060] animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing knowledge graph...
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 max-w-sm">
                      {populatedRelatedNotes.map(rn => (
                        <button
                          key={rn.id} onClick={() => handleNoteSelect(rn.id)}
                          className="text-[14px] px-3 py-2 text-left bg-transparent hover:bg-[#2a2a2a] rounded-md transition-colors text-[#a0a0a0] hover:text-[#EBEBEB] border-b border-[#2f2f2f] hover:border-transparent flex items-center gap-2"
                        >
                           • {rn.title || 'Untitled'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
