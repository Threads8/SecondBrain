export const aiCache = new Map();
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const safeParseJSONArray = (rawString) => {
  try {
    const cleaned = rawString.replace(/```json/g, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\[.*\]/s);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
};

export const normalizeResults = (idsOrTitles, notes) => {
  if (!Array.isArray(idsOrTitles)) return [];
  return idsOrTitles.map(item => {
    const byId = notes.find(n => n.id === item);
    if (byId) return byId.id;
    const byTitle = notes.find(n => n.title?.toLowerCase().trim() === item.toLowerCase().trim());
    return byTitle?.id;
  }).filter(Boolean);
};

export const callNvidiaAPI = async (prompt) => {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.result) {
      throw new Error("Received an empty response from backend.");
    }
    return data.result;
  } catch (error) {
    console.error("AI service error:", error);
    if (error.message.includes('Unexpected token') || error.message.includes('fetch')) {
      throw new Error("API Route Missing: Please ensure you are running the app using 'npx vercel dev' locally to serve the /api/chat endpoint, or deploy to Vercel.");
    }
    throw new Error("AI service error: " + (error.message || "Failed to fetch."));
  }
};

export const generateId = () => Math.random().toString(36).substr(2, 9);
export const extractLinks = (text) => [...new Set([...text.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1].trim()))];

export const blocksToMarkdown = (blocks) => {
  return blocks.map(b => {
    if (b.type === 'h1') return `# ${b.content}`;
    if (b.type === 'h2') return `## ${b.content}`;
    if (b.type === 'ul') return `- ${b.content}`;
    if (b.type === 'todo') return `[${b.checked ? 'x' : ' '}] ${b.content}`;
    if (b.type === 'code') return `\`\`\`\n${b.content}\n\`\`\``;
    if (b.type === 'divider') return `---`;
    return b.content;
  }).join('\n\n');
};

export const markdownToBlocks = (md) => {
  if (!md) return [{ id: generateId(), type: 'p', content: '' }];
  return md.split('\n\n').map(text => {
    const id = generateId();
    if (text.startsWith('# ')) return { id, type: 'h1', content: text.replace(/^# /, '') };
    if (text.startsWith('## ')) return { id, type: 'h2', content: text.replace(/^## /, '') };
    if (text.startsWith('- ')) return { id, type: 'ul', content: text.replace(/^- /, '') };
    if (text.startsWith('[ ] ') || text.startsWith('[x] ')) {
      return { id, type: 'todo', content: text.slice(4), checked: text.startsWith('[x] ') };
    }
    if (text.startsWith('```')) {
      const codeContent = text.replace(/```(.*?)\n/g, '').replace(/```/g, '').trim();
      return { id, type: 'code', content: codeContent };
    }
    if (text.trim() === '---') return { id, type: 'divider', content: '' };
    return { id, type: 'p', content: text };
  });
};

export const parseMarkdown = (text) => {
  if (!text) return '';
  let parsed = text
    .replace(/\[\[(.*?)\]\]/g, '<a href="#" class="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-500/30 underline-offset-4 transition-colors internal-link font-medium" data-target="$1">[[$1]]</a>')
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-semibold mt-6 mb-3 text-slate-100">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-8 mb-4 text-slate-50">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-extrabold mt-10 mb-5 text-white tracking-tight">$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-slate-200 font-bold">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em class="text-slate-300 italic">$1</em>')
    .replace(/`(.*?)`/gim, '<code class="bg-slate-800/80 text-emerald-400 px-1.5 py-0.5 rounded-md font-mono text-sm border border-slate-700/50">$1</code>')
    .replace(/\n$/gim, '<br />')
    .replace(/\n/gim, '<br />');
  parsed = parsed.replace(/(<br \/>)?^- (.*)(<br \/>)?/gim, '<li class="ml-4 list-disc marker:text-indigo-500">$2</li>');
  return parsed;
};
