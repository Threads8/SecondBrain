import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Network, Plus, Minus, RefreshCcw, Filter, Maximize, Sparkles } from 'lucide-react';

export default function GraphView({ notes, activeNoteId, onNodeClick, searchQuery, isSemanticSearch, semanticResults }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const containerRef = useRef(null);
  const physicsNodesRef = useRef(new Map());

  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(activeNoteId);
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomTarget = useRef(1);
  const currentZoom = useRef(1);

  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f43f5e', '#06b6d4', '#14b8a6'];

  const graphData = useMemo(() => {
    const nodesMap = new Map();
    notes.forEach(n => {
      nodesMap.set(n.id, {
        id: n.id,
        title: n.title,
        tags: n.tags || [],
        contentLength: n.content?.length || 0,
        degree: 0
      });
    });

    const edges = [];
    notes.forEach(sourceNote => {
      if (!sourceNote.links || sourceNote.links.length === 0) return;
      const uniqueLinks = [...new Set(sourceNote.links.map(l => l.trim().toLowerCase()))];
      uniqueLinks.forEach(linkTitle => {
        const targetNode = notes.find(n => n.title.toLowerCase().trim() === linkTitle);
        if (targetNode && targetNode.id !== sourceNote.id) {
          edges.push({ source: sourceNote.id, target: targetNode.id });
          const sNode = nodesMap.get(sourceNote.id);
          const tNode = nodesMap.get(targetNode.id);
          if (sNode) sNode.degree++;
          if (tNode) tNode.degree++;
        }
      });
    });

    const currentPhysics = new Map();
    Array.from(nodesMap.values()).forEach(n => {
      let color = '#6366f1';
      if (n.tags && n.tags.length > 0) {
        const hash = n.tags[0].split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        color = colors[hash % colors.length];
      }
      const radius = Math.max(12, Math.min(45, 14 + (n.degree * 2.5) + (n.contentLength / 300)));
      const existing = physicsNodesRef.current.get(n.id);
      if (existing) {
        currentPhysics.set(n.id, { ...n, color, radius, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy });
      } else {
        currentPhysics.set(n.id, {
          ...n, color, radius,
          x: Math.random() * 800, y: Math.random() * 600,
          vx: 0, vy: 0
        });
      }
    });
    physicsNodesRef.current = currentPhysics;

    return { nodes: Array.from(currentPhysics.values()), edges };
  }, [notes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const container = containerRef.current;

    const resizeCanvas = () => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const nodes = graphData.nodes;
    const edges = graphData.edges.map(e => ({
      source: nodes.find(n => n.id === e.source),
      target: nodes.find(n => n.id === e.target)
    })).filter(e => e.source && e.target);

    const repulsion = 4000, springLength = 140, springK = 0.04, damping = 0.85, centerPull = 0.01;

    let isDragging = false, draggedNode = null, hasDragged = false;
    let dragStartX = 0, dragStartY = 0;
    let panX = 0, panY = 0;
    let isPanning = false, panStartX = 0, panStartY = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      currentZoom.current += (zoomTarget.current - currentZoom.current) * 0.1;
      const zm = currentZoom.current;

      ctx.save();
      ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
      ctx.scale(zm, zm);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node === draggedNode) continue;
        let fx = 0, fy = 0;
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const other = nodes[j];
          const dx = node.x - other.x, dy = node.y - other.y;
          let distSq = dx * dx + dy * dy;
          if (distSq === 0) distSq = 0.1;
          const force = (repulsion * (node.radius + other.radius) / 30) / distSq;
          const dist = Math.sqrt(distSq);
          fx += (dx / dist) * force; fy += (dy / dist) * force;
        }
        fx += (canvas.width / 2 - node.x) * centerPull;
        fy += (canvas.height / 2 - node.y) * centerPull;
        node.vx = (node.vx + fx) * damping; node.vy = (node.vy + fy) * damping;
      }

      edges.forEach(edge => {
        const dx = edge.target.x - edge.source.x, dy = edge.target.y - edge.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const force = (dist - springLength) * springK;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        if (edge.source !== draggedNode) { edge.source.vx += fx; edge.source.vy += fy; }
        if (edge.target !== draggedNode) { edge.target.vx -= fx; edge.target.vy -= fy; }
      });

      const isSearching = searchQuery?.trim().length > 0;
      const lowerSearch = searchQuery?.toLowerCase() || '';
      const focusNodeId = hoveredNode?.id || selectedNodeId;

      const neighborhood = new Set();
      if (focusNodeId) {
        neighborhood.add(focusNodeId);
        edges.forEach(e => {
          if (e.source.id === focusNodeId) neighborhood.add(e.target.id);
          if (e.target.id === focusNodeId) neighborhood.add(e.source.id);
        });
      }

      ctx.lineWidth = 1.5;
      edges.forEach(edge => {
        const isConnectedToFocus = neighborhood.has(edge.source.id) && neighborhood.has(edge.target.id) && focusNodeId;
        
        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);

        if (isConnectedToFocus && ((edge.source.id === focusNodeId) || (edge.target.id === focusNodeId))) {
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)'; // Bright Blue
          ctx.lineWidth = 2.5;
        } else {
          ctx.strokeStyle = focusNodeId ? 'rgba(40, 40, 40, 0.3)' : 'rgba(80, 80, 80, 0.4)'; // Dim
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      });

      nodes.forEach(node => {
        if (node !== draggedNode) {
          node.x += node.vx; node.y += node.vy;
          // Soft bounds
          if (node.x < 50) node.vx += 1; if (node.x > canvas.width - 50) node.vx -= 1;
          if (node.y < 50) node.vy += 1; if (node.y > canvas.height - 50) node.vy -= 1;
        }

        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNodeId === node.id;
        let isVisible = true;
        let isSemanticMatch = false;

        if (isSearching) {
          if (isSemanticSearch) {
            isVisible = semanticResults.includes(node.id);
            if (isVisible) isSemanticMatch = true;
          } else {
            isVisible = (node.title && node.title.toLowerCase().includes(lowerSearch)) ||
                        (node.tags && node.tags.some(t => t.toLowerCase().includes(lowerSearch)));
          }
        }

        if (selectedNodeId && !neighborhood.has(node.id)) {
          isVisible = false;
        }

        const isCentral = isHovered || isSelected;

        // Draw Glow
        if (isCentral || isSemanticMatch) {
          ctx.shadowBlur = isSemanticMatch ? 35 : 25;
          ctx.shadowColor = isSemanticMatch ? node.color : 'rgba(99, 102, 241, 0.8)';
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = isVisible ? (isCentral ? '#1e3a8a' : '#151515') : 'rgba(20, 20, 20, 0.5)';
        ctx.fill();

        ctx.lineWidth = isCentral ? 3 : 2;
        ctx.strokeStyle = isVisible ? (isCentral ? '#6366f1' : '#333333') : 'rgba(50, 50, 50, 0.2)';
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset

        if (isVisible) {
          ctx.fillStyle = isCentral ? '#ffffff' : '#808080';
          ctx.font = `${isCentral ? 'bold ' : ''}13px Inter, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          let displayTitle = node.title || 'Untitled';
          if (displayTitle.length > 20) displayTitle = displayTitle.substring(0, 18) + '...';
          ctx.fillText(displayTitle, node.x, node.y + node.radius + 16);
        }
      });

      ctx.restore();
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    const getMousePos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      
      const zm = currentZoom.current;
      const cx = canvas.width / 2 + panX;
      const cy = canvas.height / 2 + panY;
      
      return {
        x: (rawX - cx) / zm + canvas.width / 2,
        y: (rawY - cy) / zm + canvas.height / 2,
        rawX, rawY
      };
    };

    const handleMouseDown = (e) => {
      const pos = getMousePos(e);
      dragStartX = pos.x; dragStartY = pos.y;
      panStartX = pos.rawX - panX; panStartY = pos.rawY - panY;
      hasDragged = false;

      let foundNode = null;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const dx = pos.x - node.x, dy = pos.y - node.y;
        if (dx * dx + dy * dy < node.radius * node.radius) { foundNode = node; break; }
      }

      if (foundNode) {
        isDragging = true;
        draggedNode = foundNode;
      } else {
        isPanning = true;
      }
    };

    const handleMouseMove = (e) => {
      const pos = getMousePos(e);
      
      if (isDragging && draggedNode) {
        if (Math.abs(pos.x - dragStartX) > 2 || Math.abs(pos.y - dragStartY) > 2) hasDragged = true;
        draggedNode.x = pos.x; draggedNode.y = pos.y;
        return;
      }
      
      if (isPanning) {
        panX = pos.rawX - panStartX;
        panY = pos.rawY - panStartY;
        hasDragged = true;
        return;
      }

      let foundHover = null;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const dx = pos.x - node.x, dy = pos.y - node.y;
        if (dx * dx + dy * dy < node.radius * node.radius) { foundHover = node; break; }
      }
      setHoveredNode(foundHover);
      canvas.style.cursor = foundHover ? 'pointer' : (isPanning ? 'grabbing' : 'grab');
    };

    const handleMouseUp = () => { isDragging = false; draggedNode = null; isPanning = false; };

    const handleClick = (e) => {
      if (hasDragged) { hasDragged = false; return; }
      const pos = getMousePos(e);
      let foundNode = null;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const dx = pos.x - node.x, dy = pos.y - node.y;
        if (dx * dx + dy * dy < node.radius * node.radius) { foundNode = node; break; }
      }
      
      if (foundNode) setSelectedNodeId(foundNode.id);
      else setSelectedNodeId(null);
    };

    const handleWheel = (e) => {
        zoomTarget.current += e.deltaY * -0.001;
        zoomTarget.current = Math.min(Math.max(0.3, zoomTarget.current), 3);
        setZoomLevel(zoomTarget.current);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationRef.current);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [graphData, selectedNodeId, searchQuery, isSemanticSearch, semanticResults]);

  const selectedNodeData = selectedNodeId ? graphData.nodes.find(n => n.id === selectedNodeId) : null;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#0a0a0a] overflow-hidden animate-in fade-in duration-500 font-sans">
      {/* Subtle dotted matrix background */}
      <div className="absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(circle,_#333_1px,_transparent_1px)] bg-[size:24px_24px]"></div>

      <canvas ref={canvasRef} className="block w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Left: Active Node Dashboard */}
      {selectedNodeData && (
        <div className="absolute top-6 left-6 z-10 w-[240px] bg-[#151515] border border-[#2f2f2f] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-in slide-in-from-left-4 fade-in duration-300">
          <div className="p-4">
            <h2 className="text-white text-lg font-bold leading-tight mb-1">{selectedNodeData.title || 'Untitled Node'}</h2>
            <p className="text-[#808080] text-sm font-medium">{selectedNodeData.degree || 0} connections</p>
          </div>
          <div className="px-4 pb-4">
            <button 
              onClick={() => onNodeClick(selectedNodeData.id)} 
              className="w-full bg-[#6366f1] hover:bg-[#5255d4] text-white font-medium text-sm py-2 rounded-lg transition-colors shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)]"
            >
              Open Note
            </button>
          </div>
        </div>
      )}

      {/* Top Right: Toolbar */}
      <div className="absolute top-6 right-6 z-10 bg-[#151515] border border-[#2f2f2f] rounded-full px-2 py-1.5 flex items-center gap-2 shadow-2xl">
        <button 
          className="p-1.5 text-[#808080] hover:text-white transition-colors" 
          onClick={() => { 
            zoomTarget.current = Math.max(0.3, zoomTarget.current - 0.2); 
            setZoomLevel(zoomTarget.current); 
          }}
        >
          <Minus className="w-4 h-4" />
        </button>
        
        <input 
          type="range" 
          min="0.3" 
          max="3" 
          step="0.01"
          value={zoomLevel}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            zoomTarget.current = val;
            setZoomLevel(val);
          }}
          className="w-16 h-1 bg-[#2a2a2a] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow"
        />

        <button 
          className="p-1.5 text-[#808080] hover:text-white transition-colors" 
          onClick={() => { 
            zoomTarget.current = Math.min(3, zoomTarget.current + 0.2); 
            setZoomLevel(zoomTarget.current);
          }}
        >
          <Plus className="w-4 h-4" />
        </button>
        
        <div className="w-px h-5 bg-[#2f2f2f] mx-1"></div>
        <button 
          className="p-1.5 text-[#808080] hover:text-white transition-colors" 
          onClick={() => { 
            zoomTarget.current = 1; 
            setZoomLevel(1);
          }}
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Left: Legend */}
      <div className="absolute bottom-6 left-6 z-10">
        <div className="text-[11px] font-semibold text-[#606060] uppercase tracking-wider mb-2 pl-1">Legend</div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#EBEBEB]">
            <div className="w-3 h-3 rounded-full bg-[#6366f1]"></div> Current Note
          </div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#EBEBEB]">
            <div className="w-3 h-3 rounded-full bg-[#151515] border-2 border-[#333333]"></div> Related Notes
          </div>
        </div>
      </div>

      {/* Removed Bottom Right: AI Actions Placeholder */}
    </div>
  );
}
