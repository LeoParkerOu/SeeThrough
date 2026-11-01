import { componentRelations } from './component-relations.mjs';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createFactoryScene } from './factory-scene.js';

const PLUGIN_ID = '@leoparkerou/dsh-seethrough';
const TAB_KIND = 'factory-probe';
const API = '/api/factory-probe';
const styles = `
.dsh-factory-probe{height:100%;min-height:0;position:relative;display:flex;flex-direction:column;overflow:auto;background:var(--dsw-alias-bg-base,#f5f7fa);color:var(--dsw-alias-label-primary,#18212f);font:12px/1.45 system-ui,sans-serif}
.dsh-factory-probe *{box-sizing:border-box}
.dsh-factory-probe button{font:inherit;cursor:pointer;border:1px solid #9baabc66;border-radius:7px;padding:5px 8px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit}
.dsh-factory-probe button:disabled{cursor:default;opacity:.5}
.dsh-factory-probe button:focus-visible{outline:2px solid #417bdd;outline-offset:2px}
.dsh-factory-probe .factory-toolbar{display:flex;flex:none;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;padding:10px 12px;border-bottom:1px solid #b6c9d538;background:linear-gradient(120deg,#f8fbfd,#fff)}
.dsh-factory-probe .factory-library{display:flex;flex:none;gap:8px;align-items:center;padding:7px 12px;border-bottom:1px solid #b6c9d538;background:#f8fbfd}
.dsh-factory-probe .factory-library select{font:inherit;min-width:0;flex:1;border:1px solid #9baabc66;border-radius:6px;padding:5px;background:#fff;color:inherit}
.dsh-factory-probe .factory-repositories{max-width:300px;font-size:10px;color:#627086;overflow-wrap:anywhere}
.dsh-factory-probe .factory-repositories summary{cursor:pointer}
.dsh-factory-probe .factory-welcome{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:12px;padding:28px;background:linear-gradient(145deg,#edf4f5,#fbfcf8);color:#405d63}
.dsh-factory-probe .factory-welcome strong{font-size:18px;color:#294a50}
.dsh-factory-probe .factory-welcome p{margin:0;max-width:330px;line-height:1.8}
.dsh-factory-probe .factory-navigation{display:flex;gap:4px;flex-wrap:wrap}
.dsh-factory-probe .factory-navigation button[aria-pressed=true]{background:#417bdd16;border-color:#417bdd}
.dsh-factory-probe .factory-legend{flex:none;padding:5px 12px;background:#edf3f6;color:#526979;font-size:10px;display:flex;gap:12px;flex-wrap:wrap}
.dsh-factory-probe .factory-binding{display:inline-block;font-size:10px;padding:2px 6px;border-radius:4px;background:#dcece4;color:#345e4d;margin:3px 0}
.dsh-factory-probe .factory-binding[data-state=stale],.dsh-factory-probe .factory-binding[data-state=unverified]{background:#fff0d0;color:#7a521f}
.dsh-factory-probe .factory-navigation button{font-size:11px;padding:5px 7px}
.dsh-factory-probe .factory-caption{font-size:10px;color:var(--dsw-alias-label-secondary,#627086)}
.dsh-factory-probe .factory-view-path{font-size:10px;opacity:.65;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-factory-probe .factory-view{flex:1 0 280px;min-height:280px;position:relative;overflow:hidden;isolation:isolate}
.dsh-factory-probe .factory-scene{position:absolute;inset:0;min-height:280px;touch-action:none}
.dsh-factory-probe .factory-scene canvas{display:block;width:100%;height:100%}
.dsh-factory-probe .factory-controls{display:flex;align-items:center;flex:none;gap:6px;padding:5px 9px;border-block:1px solid #b6c9d538;background:#f9fbfc}
.dsh-factory-probe .factory-parts{display:flex;flex:1;min-width:0;min-height:30px;padding-bottom:4px;align-items:flex-start;gap:4px;overflow-x:auto;overscroll-behavior:contain;scrollbar-width:thin}
.dsh-factory-probe .factory-part{flex:none;max-width:140px;padding:5px 8px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:11px}
.dsh-factory-probe .factory-part[data-factory-highlighted=true]{border-color:#d49422;background:#e9ad2920}
.dsh-factory-probe .factory-part[data-factory-selected=true]{border-color:#417bdd;box-shadow:inset 0 0 0 1px #417bdd;background:#417bdd12}
.dsh-factory-probe .factory-zoom{display:flex;align-items:center;gap:3px}
.dsh-factory-probe .factory-zoom button{width:27px;padding:4px 0;font-size:15px}
.dsh-factory-probe .factory-zoom-value{font-size:10px;min-width:28px;text-align:center;font-variant-numeric:tabular-nums}
.dsh-factory-probe .factory-details{flex:0 0 136px;min-height:136px;padding:9px 12px;overflow:auto;overscroll-behavior:contain;background:#fcfdfd}
.dsh-factory-probe .factory-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px}
.dsh-factory-probe .factory-detail-title{font-size:13px;font-weight:650}
.dsh-factory-probe .factory-breadcrumb{font-size:10px;color:var(--dsw-alias-label-secondary,#627086);margin-bottom:6px;overflow-wrap:anywhere}
.dsh-factory-probe .factory-node-id{font:10px/1.4 ui-monospace,monospace;opacity:.65;overflow-wrap:anywhere}
.dsh-factory-probe .factory-evidence{margin-top:8px;font-size:11px}
.dsh-factory-probe .factory-evidence summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#627086)}
.dsh-factory-probe .factory-evidence-body{margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px}
.dsh-factory-probe .factory-context-menu{position:absolute;z-index:50;width:188px;padding:5px;border:1px solid #9baabc66;border-radius:9px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 6px 24px #18212f26;overflow:auto}
.dsh-factory-probe .factory-menu-title{padding:3px 7px 5px;font-size:10px;opacity:.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-factory-probe .factory-context-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:7px}
.dsh-factory-probe .factory-context-menu button:hover,.dsh-factory-probe .factory-context-menu button:focus-visible{background:#417bdd12}
.dsh-factory-probe .factory-detail-head button{flex:none}
.dsh-factory-probe .factory-description{margin:4px 0 7px;color:var(--dsw-alias-label-secondary,#627086);overflow-wrap:anywhere}
.dsh-factory-probe .factory-properties{display:grid;grid-template-columns:36px minmax(0,1fr);gap:4px 7px;margin:0;font-size:11px}
.dsh-factory-probe .factory-properties dt{opacity:.65}
.dsh-factory-probe .factory-properties dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-factory-probe .factory-empty{height:100%;display:flex;flex-direction:column;justify-content:center;gap:6px;color:var(--dsw-alias-label-secondary,#627086)}
.dsh-factory-probe .factory-message{flex:none;padding:5px 11px;border-top:1px solid #9baabc22;font-size:10px;overflow-wrap:anywhere}
.dsh-factory-probe .factory-job{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#edf5eb;color:#294a38}
.dsh-factory-probe .factory-job[data-state=failed],.dsh-factory-probe .factory-job[data-state=stale]{background:#fff0d0;color:#7a521f}
.dsh-factory-probe .factory-error{color:#b32b34;background:#e9414110}
.dsh-factory-probe .factory-explanation{flex:none;padding:8px 12px;border-block:1px solid #c7dce7;background:#eef6fa;color:#2a4b61;max-height:112px;overflow:auto;overflow-wrap:anywhere}
.dsh-factory-probe .factory-explanation-heading{font-size:10px;font-weight:650;margin-bottom:3px}
.dsh-factory-probe .factory-explanation-text{margin:0;white-space:pre-wrap}
.dsh-factory-probe .factory-explanation-status{font-size:10px;color:#73551f;margin-top:4px}
.dsh-factory-open{font:12px system-ui,sans-serif;border:1px solid #8ca2bd66;border-radius:8px;padding:6px 10px;background:transparent;color:inherit;cursor:pointer}
`;

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

const jobLabels = {
  queued: '正在准备制图…', running: '正在更新工厂图…', completed: '工厂图已更新。',
  failed: '这次制图未完成，可以重试。', stale: '代码已有新变化，工厂图需要更新。',
};

function displayJob(job) {
  if (!job || !Object.hasOwn(jobLabels, job.state)) return null;
  // Only short status text belongs in the product UI, never background task instructions.
  const message = typeof job.message === 'string' && job.message.trim().length <= 160
    ? job.message.trim() : '';
  return { state: job.state, message: message || jobLabels[job.state] };
}

async function enableFactory(sessionId, signal) {
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('请先打开一个项目会话。');
  const response = await fetch(`${API}/enable`, {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) throw new Error(`暂时无法打开SeeThrough（HTTP ${response.status}），请重试。`);
}

async function graphRequest(endpoint, sessionId, graphId, signal) {
  if (!graphId) throw new Error('请先在原对话里说明你想看哪个代码库。');
  const response = await fetch(`${API}/${endpoint}`, {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, graphId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `操作未完成（HTTP ${response.status}），请重试。`);
  return result;
}

function safeLibrary(value) {
  if (!value || !Array.isArray(value.entries)) throw new Error('无法读取已保存的工厂图。');
  const entries = value.entries.filter(entry => entry && typeof entry.id === 'string' && entry.id);
  const activeId = typeof value.activeId === 'string' && value.activeId ? value.activeId : null;
  const active = activeId && value.active?.id === activeId ? value.active : entries.find(entry => entry.id === activeId) ?? null;
  if (activeId && !active) throw new Error('当前工厂图信息不完整，请重新选择。');
  return { activeId, active, entries };
}

function componentReference(id, label, target) {
  if (!target?.id) throw new Error('当前工厂图已切换，请重新选择组件。');
  return `@组件[${id}]（${label}；图:${target.title || '未命名工厂图'} / ${target.id}）`;
}

function safeGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('机器状态缺少 nodes 或 edges。');
  const seen = new Set();
  const nodes = graph.nodes.map(node => {
    if (!node || typeof node.id !== 'string' || !node.id || seen.has(node.id)) throw new Error('机器组件 ID 缺失或重复。');
    seen.add(node.id);
    if (node.data != null && (typeof node.data !== 'object' || Array.isArray(node.data))) throw new Error('机器组件 data 格式错误。');
    // Keep the complete host graph, including parentId, kind, role and sourceRefs.
    return { ...node, data: { ...(node.data ?? {}) } };
  });
  const edges = graph.edges.map(edge => {
    if (!edge || !seen.has(edge.source) || !seen.has(edge.target)) throw new Error('机器连线引用不存在的组件。');
    return { ...edge };
  });
  return { ...graph, nodes, edges };
}

function nodeLabel(node) {
  return String(node?.data?.label ?? node?.label ?? node?.title ?? '未命名组件');
}

function projectTitle(graph) {
  const title = typeof graph.project === 'string' ? graph.project : graph.project?.name ?? graph.project?.title ?? graph.title;
  return typeof title === 'string' && title.trim() ? `${title.trim()} · SeeThrough` : 'SeeThrough';
}

function menuPosition(panel, clientX, clientY, menuWidth = 188, menuHeight = 106) {
  const bounds = panel.getBoundingClientRect();
  const inset = 6;
  const maxWidth = Math.max(1, panel.clientWidth - inset * 2);
  const maxHeight = Math.max(1, panel.clientHeight - inset * 2);
  const clamp = (value, maximum) => Math.max(inset, Math.min(value, maximum));
  return {
    left: panel.scrollLeft + clamp(clientX - bounds.left - panel.clientLeft, panel.clientWidth - Math.min(menuWidth, maxWidth) - inset),
    top: panel.scrollTop + clamp(clientY - bounds.top - panel.clientTop, panel.clientHeight - Math.min(menuHeight, maxHeight) - inset),
    maxWidth, maxHeight,
  };
}

function ownershipPath(node, nodes) {
  const labels = [];
  const visited = new Set();
  let current = node;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    labels.unshift(nodeLabel(current));
    current = nodes.find(candidate => candidate.id === current.data?.parentId);
  }
  return labels.join(' › ');
}

function detailText(value) {
  if (value == null || value === '') return '未提供';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? value.map(detailText).join('\n') : '未提供';
  return JSON.stringify(value, null, 2);
}

function sourceText(value) {
  if (value == null) return '未提供';
  const refs = Array.isArray(value) ? value : [value];
  if (!refs.length) return '未提供';
  return refs.map(ref => {
    if (typeof ref === 'string') return ref;
    if (!ref || typeof ref !== 'object') return detailText(ref);
    const file = ref.path ?? ref.file ?? ref.filePath;
    if (!file) return detailText(ref);
    const line = ref.line ?? ref.startLine ?? ref.lineStart;
    const end = ref.endLine ?? ref.lineEnd;
    return `${file}${line == null ? '' : `:${line}${end == null || end === line ? '' : `–${end}`}`}${ref.symbol ? ` · ${ref.symbol}` : ''}`;
  }).join('\n');
}

function nextFrame(signal) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    let frame;
    const cancel = () => { cancelAnimationFrame(frame); resolve(false); };
    signal.addEventListener('abort', cancel, { once: true });
    frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel);
      resolve(!signal.aborted);
    });
  });
}

function FactoryCanvas({ sessionId, insertReference, askNode, requestGeneration, selectGraph, useTabInfo }) {
  const [viewHistory, setViewHistory] = useState([]);
  const [relationView, setRelationView] = useState(null);
  const [presetId, setPresetId] = useState(null);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [highlighted, setHighlighted] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [scene, setScene] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [inputMode, setInputMode] = useState('pan');
  const [viewRegion, setViewRegion] = useState('overview');
  const [visibleIds, setVisibleIds] = useState([]);
  const [viewBreadcrumb, setViewBreadcrumb] = useState([]);
  const [networkError, setNetworkError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [notice, setNotice] = useState('正在读取已保存的工厂图…');
  const [sending, setSending] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [job, setJob] = useState(null);
  const [startingGeneration, setStartingGeneration] = useState(false);
  const [library, setLibrary] = useState({ activeId: null, active: null, entries: [] });
  const [switchingGraph, setSwitchingGraph] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const activeTarget = useRef(null);
  const pollStop = useRef(null);
  const selectionPending = useRef(null);
  const explanationRef = useRef(null);
  const explanationElement = useRef(null);
  const explanationEpoch = useRef(0);
  const panel = useRef(null);
  const menuElement = useRef(null);
  const menuOrigin = useRef(null);
  const menuCallback = useRef(null);
  const container = useRef(null);
  const sceneRef = useRef(null);
  const selectRef = useRef(null);
  const lifecycle = useRef(null);
  const sendPending = useRef(null);
  const graphKey = useRef('');
  const graphRef = useRef({ nodes: [], edges: [] });
  const selectedRef = useRef(null);
  const highlightedRef = useRef([]);
  const appliedRevisions = useRef(new Map());
  const acknowledgedRevisions = useRef(new Set());
  const actionBaseline = useRef({ initialized: false, revision: null });
  const tabInfo = useTabInfo();
  const tabSignal = tabInfo.tab.signal;

  const clearExplanation = useCallback(() => {
    explanationEpoch.current++;
    explanationRef.current = null;
    setExplanation(null);
  }, []);

  const selectNode = useCallback((id, insert = false) => {
    if (tabSignal.aborted) throw new Error('标签页已关闭。');
    if (id !== null && !graphRef.current.nodes.some(node => node.id === id)) throw new Error('这个组件已从当前项目中移除。');
    sceneRef.current?.setSelected(id);
    selectedRef.current = id;
    setSelectedId(id);
    if (insert && id !== null) {
      insertReference(id, nodeLabel(graphRef.current.nodes.find(node => node.id === id)), activeTarget.current);
      setNotice(`已将“${nodeLabel(graphRef.current.nodes.find(node => node.id === id))}”加入原会话草稿，尚未发送。`);
    }
  }, [insertReference, tabSignal]);

  const selectFromUser = useCallback((id) => {
    const token = lifecycle.current;
    const targetScene = sceneRef.current;
    if (!token || token.signal.aborted || !targetScene) return;
    const current = () => lifecycle.current === token && !token.signal.aborted && sceneRef.current === targetScene;
    try {
      clearExplanation();
      setContextMenu(null);
      selectNode(id);
      setOperationError('');
      setNotice('已打开组件详情；右键选择“@组件”可加入原会话草稿。');
    } catch (error) { if (current()) setOperationError(errorText(error)); }
  }, [selectNode, clearExplanation]);
  selectRef.current = selectFromUser;

  const closeMenu = useCallback((restoreFocus = false) => {
    setContextMenu(null);
    if (restoreFocus && menuOrigin.current?.isConnected) menuOrigin.current.focus({ preventScroll: true });
  }, []);

  const openContextMenu = useCallback(({ id, clientX, clientY }) => {
    const token = lifecycle.current;
    if (!token || token.signal.aborted || !sceneRef.current || !panel.current) return;
    try {
      if (typeof id !== 'string' || !id) throw new Error('请先选择一个组件。');
      clearExplanation();
      selectNode(id);
      const bounds = panel.current.getBoundingClientRect();
      const x = Number.isFinite(clientX) ? clientX : bounds.left + 16;
      const y = Number.isFinite(clientY) ? clientY : bounds.top + 16;
      menuOrigin.current = panel.current.ownerDocument.activeElement;
      setContextMenu({ id, token, clientX: x, clientY: y, position: menuPosition(panel.current, x, y) });
      setOperationError('');
    } catch (error) { if (lifecycle.current === token && !token.signal.aborted) setOperationError(errorText(error)); }
  }, [selectNode, clearExplanation]);
  menuCallback.current = openContextMenu;

  useLayoutEffect(() => {
    if (!contextMenu || !menuElement.current || !panel.current) return;
    const { width, height } = menuElement.current.getBoundingClientRect();
    const position = menuPosition(panel.current, contextMenu.clientX, contextMenu.clientY, width, height);
    if (Object.keys(position).some(key => position[key] !== contextMenu.position[key])) {
      setContextMenu(previous => previous === contextMenu ? { ...previous, position } : previous);
    }
    if (!menuElement.current.contains(panel.current.ownerDocument.activeElement)) menuElement.current.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !panel.current) return;
    const document = panel.current.ownerDocument;
    const outside = event => { if (!menuElement.current?.contains(event.target)) closeMenu(); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); } };
    const scroll = event => { if (!menuElement.current?.contains(event.target)) closeMenu(); };
    const close = () => closeMenu();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('scroll', scroll, true);
    document.defaultView?.addEventListener('resize', close);
    tabSignal.addEventListener('abort', close, { once: true });
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('scroll', scroll, true);
      document.defaultView?.removeEventListener('resize', close);
      tabSignal.removeEventListener('abort', close);
    };
  }, [contextMenu, closeMenu, tabSignal]);

  const menuKeyboard = event => {
    if (event.defaultPrevented || !(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return;
    const target = event.target.closest?.('[data-factory-node], [data-part-label]');
    const id = target?.dataset.factoryNode ?? target?.dataset.partLabel ?? (event.target.tagName === 'CANVAS' ? selectedRef.current : null);
    if (!id) return;
    event.preventDefault();
    const bounds = (target ?? event.target).getBoundingClientRect();
    openContextMenu({ id, clientX: bounds.left + Math.min(bounds.width / 2, 32), clientY: bounds.bottom });
  };

  const referenceFromMenu = () => {
    const menu = contextMenu;
    const current = menu && lifecycle.current === menu.token && !menu.token.signal.aborted;
    closeMenu(Boolean(current));
    if (!current) return;
    try { selectNode(menu.id, true); setOperationError(''); }
    catch (error) { setOperationError(errorText(error)); }
  };

  // A graph is a separate interaction scope even when the conversation is unchanged.
  // Invalidate before a network round trip so late focus/ACK results cannot reach it.
  const invalidateTarget = useCallback(() => {
    lifecycle.current = null;
    pollStop.current?.();
    clearExplanation();
    graphRef.current = { nodes: [], edges: [] };
    graphKey.current = '';
    selectedRef.current = null;
    highlightedRef.current = [];
    sceneRef.current?.setHighlighted([]);
    sceneRef.current?.setSelected(null);
    sceneRef.current?.clearPreset(); setPresetId(null); setViewHistory([]); setRelationView(null);
    sceneRef.current?.setGraph({ nodes: [], edges: [] });
    setGraph({ nodes: [], edges: [] });
    setSelectedId(null);
    setHighlighted([]);
    setContextMenu(null);
    setVisibleIds([]);
    setJob(null);
    setSending(null);
  }, [clearExplanation]);

  const adoptTarget = useCallback((nextLibrary) => {
    invalidateTarget();
    activeTarget.current = nextLibrary.active;
    setLibrary(nextLibrary);
    setSceneGeneration(previous => previous + 1);
  }, [invalidateTarget]);

  const restoreGraph = useCallback(async (graphId) => {
    if (!graphId || selectionPending.current || tabSignal.aborted || graphId === activeTarget.current?.id) return;
    const controller = new AbortController();
    selectionPending.current = controller;
    const cancel = () => controller.abort();
    tabSignal.addEventListener('abort', cancel, { once: true });
    invalidateTarget();
    setSwitchingGraph(true);
    setRestoreError('');
    setOperationError('');
    setNotice('正在打开已保存的图…');
    try {
      const result = await selectGraph(graphId, controller.signal);
      if (selectionPending.current !== controller || controller.signal.aborted) return;
      const nextLibrary = safeLibrary(result.library);
      if (nextLibrary.activeId !== graphId) throw new Error('没有成功打开所选工厂图，请重试。');
      adoptTarget(nextLibrary);
      setNotice('已打开保存的工厂图，没有重新制图。');
    } catch (error) {
      if (selectionPending.current === controller && !controller.signal.aborted) {
        setRestoreError(errorText(error));
        setSceneGeneration(previous => previous + 1);
      }
    } finally {
      tabSignal.removeEventListener('abort', cancel);
      if (selectionPending.current === controller) {
        selectionPending.current = null;
        setSwitchingGraph(false);
      }
    }
  }, [adoptTarget, invalidateTarget, selectGraph, tabSignal]);

  useEffect(() => {
    activeTarget.current = null;
    setLibrary({ activeId: null, active: null, entries: [] });
    setSwitchingGraph(false);
    setRestoreError('');
    return () => {
      selectionPending.current?.abort();
      selectionPending.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    const token = { sessionId, signal: tabSignal, graphId: activeTarget.current?.id ?? null };
    clearExplanation();
    lifecycle.current = token;
    graphKey.current = '';
    graphRef.current = { nodes: [], edges: [] };
    appliedRevisions.current = new Map();
    acknowledgedRevisions.current = new Set();
    actionBaseline.current = { initialized: false, revision: null };
    selectedRef.current = null;
    highlightedRef.current = [];
    setSelectedId(null);
    setHighlighted([]);
    setGraph({ nodes: [], edges: [] });
    setJob(null);
    setStartingGeneration(false);
    setNetworkError('');
    setOperationError('');
    setNotice(token.graphId ? '正在读取已保存的工厂图…' : '在原对话里告诉我你想看哪个代码库。');
    setSending(null);
    setContextMenu(null);
    setViewRegion('overview');
    setVisibleIds([]);
    setViewBreadcrumb([]);
    setInputMode('pan');
    setZoom(1);
    let disposed = false;
    let instance;
    const current = () => !disposed && !tabSignal.aborted && lifecycle.current === token;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      clearExplanation();
      if (sceneRef.current === instance) sceneRef.current = null;
      instance?.dispose();
    };
    try {
      if (tabSignal.aborted || !container.current) return;
      instance = createFactoryScene(container.current, {
        appearanceKey: `${sessionId}:${token.graphId ?? 'empty'}`,
        onSelect(id) { if (current()) selectRef.current?.(id); },
        onContextMenu(info) { if (current()) menuCallback.current?.(info); },
        onView(info) {
          if (!current()) return;
          if (Number.isFinite(info?.zoom)) setZoom(info.zoom);
          if (typeof info?.region === 'string') setViewRegion(info.region);
          if (Array.isArray(info?.visibleIds)) {
            const ids = [...new Set(info.visibleIds.filter(id => typeof id === 'string'))];
            setVisibleIds(previous => previous.length === ids.length && previous.every((id, index) => id === ids[index]) ? previous : ids);
          }
          if (Array.isArray(info?.breadcrumb) || typeof info?.breadcrumb === 'string') {
            setViewBreadcrumb(previous => JSON.stringify(previous) === JSON.stringify(info.breadcrumb) ? previous : info.breadcrumb);
          }
        },
        onError(message) { if (current()) { clearExplanation(); setOperationError(String(message)); } },
      });
      sceneRef.current = instance;
      setScene(instance);
      tabSignal.addEventListener('abort', dispose, { once: true });
    } catch (error) {
      if (current()) setOperationError(`3D 场景启动失败：${errorText(error)}`);
      dispose();
    }
    return () => {
      tabSignal.removeEventListener('abort', dispose);
      dispose();
      if (lifecycle.current === token) lifecycle.current = null;
    };
  }, [sessionId, tabSignal, clearExplanation, sceneGeneration]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const navigate = () => clearExplanation();
    const key = event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '=', 'Home', 'PageUp', 'PageDown'].includes(event.key)) navigate(); };
    for (const event of ['pointerdown', 'wheel', 'gesturestart']) element.addEventListener(event, navigate, true);
    element.addEventListener('keydown', key, true);
    return () => {
      for (const event of ['pointerdown', 'wheel', 'gesturestart']) element.removeEventListener(event, navigate, true);
      element.removeEventListener('keydown', key, true);
    };
  }, [sessionId, clearExplanation]);

  useEffect(() => {
    if (!scene || sceneRef.current !== scene) return;
    const token = lifecycle.current;
    const controller = new AbortController();
    let timer;
    const stop = () => { controller.abort(); clearTimeout(timer); };
    pollStop.current = stop;
    tabSignal.addEventListener('abort', stop, { once: true });
    if (tabSignal.aborted) stop();
    const isStopped = () => controller.signal.aborted || sceneRef.current !== scene || lifecycle.current !== token;
    const afterRender = async () => (await nextFrame(controller.signal)) && (await nextFrame(controller.signal)) && !isStopped();

    async function applyAction(action) {
      if (action == null || action.revision == null || action.revision === 0 || action.revision === '0' || action.kind == null) return;
      if (!['string', 'number'].includes(typeof action.revision)) throw new Error('机器动作 revision 无效。');
      if (action.sessionId != null && action.sessionId !== sessionId) throw new Error('已拒绝其他会话的机器动作。');
      if (!token.graphId || action.graphId !== token.graphId) return;
      const baseline = actionBaseline.current.revision;
      // A newly opened or reloaded panel starts at the overview, not an old action.
      if (baseline != null && (String(action.revision) === String(baseline)
        || (Number.isFinite(Number(action.revision)) && Number.isFinite(Number(baseline)) && Number(action.revision) <= Number(baseline)))) return;
      const key = `${token.graphId}:${typeof action.revision}:${action.revision}`;
      if (acknowledgedRevisions.current.has(key)) return;
      let acknowledgment = appliedRevisions.current.get(key);
      if (!acknowledgment) {
        scene.clearPreset(); setPresetId(null);
        clearExplanation();
        const explanationVersion = explanationEpoch.current;
        const ids = Array.isArray(action.nodeIds) ? action.nodeIds : [];
        acknowledgment = { sessionId, graphId: token.graphId, revision: action.revision, kind: action.kind, nodeIds: ids, status: 'applied', applied: true, explanationDisplayed: false, explanationText: '' };
        try {
          if (action.explanation !== undefined && (typeof action.explanation !== 'string' || action.explanation.length > 240 || /<\/?[a-z][^>]*>/i.test(action.explanation))) throw new Error('画布讲解必须是最多240字的纯文本。');
          if (ids.some(id => typeof id !== 'string' || !graphRef.current.nodes.some(node => node.id === id))) throw new Error('动作引用不存在的组件。');
          if (action.kind === 'clear') {
            scene.setHighlighted([]);
            highlightedRef.current = [];
            setHighlighted([]);
            selectNode(null);
          } else if (action.kind === 'highlight' || action.kind === 'focus') {
            if (action.kind === 'focus' && !ids.length) throw new Error('focus 动作需要 nodeIds。');
            scene.setHighlighted(ids);
            highlightedRef.current = ids;
            setHighlighted(ids);
            if (action.kind === 'focus') {
              selectNode(ids[0]);
              const focused = await scene.focus(ids);
              if (isStopped()) return;
              if (focused === false) {
                acknowledgment.status = 'interrupted';
                acknowledgment.applied = false;
              }
            }
          } else if (action.kind !== 'refresh') throw new Error(`未支持的机器动作：${action.kind}`);
          // The scene's render and React details must settle before acknowledging.
          if (!(await afterRender())) return;
          if (acknowledgment.status === 'applied') {
            Object.assign(acknowledgment, scene.presentation(ids));
            setOperationError('');
            const text = typeof action.explanation === 'string' ? action.explanation.trim() : '';
            if (text && ids.length && ['focus', 'highlight'].includes(action.kind) && explanationEpoch.current === explanationVersion) {
              const current = { sessionId, graphId: token.graphId, revision: action.revision, text, hiddenNodeIds: acknowledgment.hiddenNodeIds ?? [] };
              explanationRef.current = current;
              setExplanation(current);
              if (!(await afterRender())) return;
              if (explanationRef.current === current && explanationEpoch.current === explanationVersion) {
                const presentation = scene.presentation(ids);
                Object.assign(acknowledgment, presentation);
                if (JSON.stringify(current.hiddenNodeIds) !== JSON.stringify(presentation.hiddenNodeIds)) {
                  current.hiddenNodeIds = presentation.hiddenNodeIds;
                  setExplanation({ ...current });
                  if (!(await afterRender())) return;
                }
                const element = explanationElement.current;
                const rect = element?.getBoundingClientRect();
                const panelRect = panel.current?.getBoundingClientRect();
                const viewport = element?.ownerDocument.defaultView;
                const displayed = explanationEpoch.current === explanationVersion && element?.dataset.explanationRevision === String(action.revision)
                  && element?.dataset.explanationSession === sessionId && element?.querySelector('.factory-explanation-text')?.textContent === text
                  && element?.dataset.explanationGraph === token.graphId
                  && rect?.width > 0 && rect?.height > 0 && panelRect && viewport
                  && rect.right > Math.max(0, panelRect.left) && rect.left < Math.min(viewport.innerWidth, panelRect.right)
                  && rect.bottom > Math.max(0, panelRect.top) && rect.top < Math.min(viewport.innerHeight, panelRect.bottom)
                  && (typeof element.checkVisibility !== 'function' || element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
                acknowledgment.explanationDisplayed = Boolean(displayed);
                acknowledgment.explanationText = displayed ? text : '';
                if (!displayed) clearExplanation();
              }
            }
          }
        } catch (error) {
          if (isStopped()) return;
          clearExplanation();
          acknowledgment.status = 'error';
          acknowledgment.applied = false;
          acknowledgment.error = errorText(error);
          setOperationError(acknowledgment.error);
        }
        if (isStopped()) return;
        appliedRevisions.current.set(key, acknowledgment);
      }
      // A failed POST may be retried after a user interaction or a graph change.
      // The old ACK must not claim a caption is still displayed after it cleared.
      if (acknowledgment.explanationDisplayed && (explanationRef.current?.revision !== action.revision
        || explanationElement.current?.querySelector('.factory-explanation-text')?.textContent !== acknowledgment.explanationText)) {
        acknowledgment.explanationDisplayed = false;
        acknowledgment.explanationText = '';
      }
      const response = await fetch(`${API}/ack`, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(acknowledgment),
      });
      if (!response.ok) throw new Error(`机器动作 ACK 失败（HTTP ${response.status}）。`);
      if (isStopped()) return;
      acknowledgedRevisions.current.add(key);
      setNotice(acknowledgment.status === 'applied'
        ? (acknowledgment.presented === 'partial'
          ? '已调整画面；部分内部组件还需放大才能看清，已通知原会话。'
          : ({ focus: '已定位并突出显示相关组件。', highlight: '已突出显示相关组件。', clear: '已清除组件标记。', refresh: '组件视图已更新。' }[action.kind] ?? '组件视图已更新。'))
        : acknowledgment.status === 'interrupted'
          ? '视角移动已被新的画布操作中断。'
          : '这次画布操作未完成，已通知原会话。');
    }

    async function poll() {
      if (isStopped()) return;
      try {
        if (!sessionId) throw new Error('机器缺少会话 ID。');
        const response = await fetch(`${API}/state?sessionId=${encodeURIComponent(sessionId)}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error(`读取机器失败（HTTP ${response.status}）。`);
        const state = await response.json();
        if (isStopped()) return;
        if (state.sessionId != null && state.sessionId !== sessionId) throw new Error('已拒绝其他会话的机器状态。');
        const nextLibrary = safeLibrary(state.library);
        if (nextLibrary.activeId !== (activeTarget.current?.id ?? null)) {
          adoptTarget(nextLibrary);
          return;
        }
        activeTarget.current = nextLibrary.active;
        setLibrary(previous => JSON.stringify(previous) === JSON.stringify(nextLibrary) ? previous : nextLibrary);
        setJob(nextLibrary.activeId && (!state.job?.graphId || state.job.graphId === nextLibrary.activeId) ? displayJob(state.job) : null);
        const nextGraph = safeGraph(state.graph);
        const key = JSON.stringify(nextGraph);
        if (key !== graphKey.current) {
          clearExplanation();
          scene.clearPreset(); setPresetId(null); setViewHistory([]); setRelationView(null);
          scene.setGraph(nextGraph);
          graphKey.current = key;
          graphRef.current = nextGraph;
          setGraph(nextGraph);
          const existing = new Set(nextGraph.nodes.map(node => node.id));
          const remaining = highlightedRef.current.filter(id => existing.has(id));
          highlightedRef.current = remaining;
          scene.setHighlighted(remaining);
          setHighlighted(remaining);
          if (selectedRef.current !== null && !existing.has(selectedRef.current)) selectNode(null);
          else scene.setSelected(selectedRef.current);
          setNotice(nextGraph.meta?.empty
            ? nextLibrary.activeId ? '工厂图准备好后会自动显示，你可以继续原来的对话。' : '在原对话里告诉我你想看哪个代码库；指定后才会制图。'
            : '单击查看组件；右键选择“@组件”可加入原会话草稿。');
        }
        setNetworkError('');
        if (!actionBaseline.current.initialized) {
          if (state.action?.sessionId != null && state.action.sessionId !== sessionId) throw new Error('已拒绝其他会话的机器动作。');
          if (state.action?.revision != null && !['string', 'number'].includes(typeof state.action.revision)) throw new Error('机器动作 revision 无效。');
          // Intentionally do not ACK history as if this panel had executed it.
          actionBaseline.current = { initialized: true, revision: state.action?.graphId === token.graphId ? state.action?.revision ?? null : null };
        } else await applyAction(state.action);
      } catch (error) {
        if (!isStopped()) { clearExplanation(); setNetworkError(errorText(error)); }
      } finally {
        if (!isStopped()) timer = setTimeout(poll, 700);
      }
    }
    void poll();
    return () => { stop(); if (pollStop.current === stop) pollStop.current = null; tabSignal.removeEventListener('abort', stop); };
  }, [sessionId, scene, tabSignal, selectNode, clearExplanation, adoptTarget]);

  const ask = useCallback(async (id) => {
    const token = lifecycle.current;
    if (!token || token.signal.aborted || sendPending.current === token) return;
    sendPending.current = token;
    setSending(id);
    setOperationError('');
    const current = () => lifecycle.current === token && !token.signal.aborted;
    try {
      const node = graphRef.current.nodes.find(candidate => candidate.id === id);
      if (!node) throw new Error('零件已从当前机器移除。');
      await askNode(id, nodeLabel(node), activeTarget.current);
      if (current()) setNotice(`已在原会话询问“${nodeLabel(node)}”，原有草稿仍保留。`);
    } catch (error) {
      if (current()) setOperationError(errorText(error));
    } finally {
      if (sendPending.current === token) sendPending.current = null;
      if (current()) setSending(null);
    }
  }, [askNode]);

  const retryGeneration = useCallback(async () => {
    const token = lifecycle.current;
    if (!token?.graphId || token.signal.aborted || startingGeneration) return;
    const current = () => lifecycle.current === token && !token.signal.aborted;
    setStartingGeneration(true);
    setOperationError('');
    try {
      await requestGeneration(token.graphId, token.signal);
      if (current()) setNotice('已请求更新工厂图，你可以继续原来的对话。');
    } catch (error) {
      if (current()) setOperationError(errorText(error));
    } finally {
      if (current()) setStartingGeneration(false);
    }
  }, [requestGeneration, startingGeneration]);

  const presets = Array.isArray(graph.meta?.keyViews) ? graph.meta.keyViews : [];
  const preset = presets.find(v => v.id === presetId);
  const exitPreset = () => { setRelationView(null); sceneRef.current?.clearPreset(); setPresetId(null); };
  const visibleNodes = useMemo(() => visibleIds.map(id => graph.nodes.find(node => node.id === id)).filter(Boolean), [graph, visibleIds]);
  const viewPath = typeof viewBreadcrumb === 'string' ? viewBreadcrumb : viewBreadcrumb.map(item => {
    if (typeof item === 'string') return graph.nodes.some(node => node.id === item) ? nodeLabel(graph.nodes.find(node => node.id === item)) : item;
    return String(item?.label ?? item?.title ?? item?.id ?? '');
  }).filter(Boolean).join(' › ');
  const selected = graph.nodes.find(node => node.id === selectedId);
  const menuNode = contextMenu && graph.nodes.find(node => node.id === contextMenu.id);
  const detail = selected?.data ?? {};
  const sourceState = detail.sourceStatus?.state ?? 'unverified';
  const sourceLabel = { verified:'代码对应已核对', relocated:'代码位置已跟随更新', stale:'图与代码关联待核实', unverified:'代码关联尚未核实' }[sourceState];
  const uncertainNodes = graph.nodes.filter(n => !['verified','relocated'].includes(n.data?.sourceStatus?.state));
  const generationBusy = startingGeneration || job?.state === 'queued' || job?.state === 'running';
  const canRetryGeneration = Boolean(library.activeId) && !switchingGraph && !startingGeneration && (Boolean(networkError)
    || (!generationBusy && (job?.state === 'failed' || job?.state === 'stale' || Boolean(graph.meta?.empty))));
  useEffect(() => { scene?.setInputMode(inputMode); }, [scene, inputMode]);
  const viewAction = async (operation) => {
    const token = lifecycle.current;
    const targetScene = sceneRef.current;
    const current = () => lifecycle.current === token && !tabSignal.aborted && sceneRef.current === targetScene;
    try {
      clearExplanation();
      if (!token || tabSignal.aborted || !targetScene) throw new Error('画布尚未就绪。');
      setOperationError('');
      const completed = await operation(targetScene);
      if (current() && completed === false) setNotice('视角移动已被新的画布操作中断。');
    } catch (error) { if (current()) setOperationError(errorText(error)); }
  };

  const componentAction = (id, kind, deep = false) => {
    if (!sceneRef.current || !lifecycle.current || lifecycle.current.signal.aborted || switchingGraph) return;
    closeMenu(true);
    const snapshot = { camera:sceneRef.current.captureView(), presetId, relationView, selectedId, highlighted:[...highlighted] };
    setViewHistory(previous => [...previous.slice(-19), snapshot]);
    setPresetId(null);
    if (kind === 'enter') {
      setRelationView(null);
      void viewAction(instance => { instance.clearPreset(); return instance.focus([id]); });
      return;
    }
    const result = componentRelations(graph, id, kind, deep);
    setRelationView({ id, kind, deep, edges:result.edges, nodeIds:result.nodeIds });
    void viewAction(instance => instance.showPreset({ nodeIds:result.nodeIds, edgeIds:result.edges.map(edge => edge.id), expand:true }));
  };
  const returnView = () => {
    const saved = viewHistory.at(-1);
    if (!saved) return;
    setViewHistory(previous => previous.slice(0,-1));
    setPresetId(saved.presetId); setRelationView(saved.relationView);
    selectNode(saved.selectedId);
    highlightedRef.current = saved.highlighted; setHighlighted(saved.highlighted);
    sceneRef.current?.setHighlighted(saved.highlighted);
    void viewAction(instance => instance.restoreView(saved.camera));
  };

  return <div ref={panel} className="dsh-factory-probe" data-factory-session={sessionId} onKeyDown={menuKeyboard}
    data-factory-graph={library.activeId ?? undefined}
    data-factory-job={job?.state ?? (startingGeneration ? 'queued' : undefined)}
    data-factory-region={viewRegion} data-factory-visible={visibleIds.join(' ')}
    data-factory-selected={selectedId ?? undefined} data-factory-highlighted={highlighted.length ? highlighted.join(' ') : undefined}>
    <style>{styles}</style>
    <div className="factory-toolbar">
      <div><strong>{library.active?.title ? `${library.active.title} · SeeThrough` : projectTitle(graph)}</strong>
        {library.active && <details className="factory-repositories"><summary>范围：{(library.active.repositories ?? []).map(repo => repo.label || repo.path).join('、') || '已指定的代码库'}</summary>
          {(library.active.repositories ?? []).map(repo => <div key={repo.id || repo.path}>{repo.path}</div>)}
        </details>}
        {library.activeId && <><div className="factory-caption">{inputMode === 'rotate' ? '两指或拖动旋转 · 捏合缩放' : '两指平移 · 捏合缩放 · ⌥ 两指旋转'}</div>
        <div className="factory-view-path" title={viewPath} aria-label="当前视角">{viewPath || (viewRegion === 'overview' ? '项目全景' : nodeLabel(graph.nodes.find(node => node.id === viewRegion)))}</div></>}
      </div>
      {library.activeId && <div className="factory-navigation">
        <button disabled={!scene || !viewHistory.length || switchingGraph} onClick={returnView}>返回上一视角</button>
        <button disabled={!scene || switchingGraph} onClick={() => { exitPreset(); void viewAction(instance => instance.home(true)); }}>项目全景</button>
        <button disabled={!scene || !selected || switchingGraph} onClick={() => { exitPreset(); void viewAction(instance => instance.focus([selected.id])); }}>定位所选</button>
        <button disabled={!scene || switchingGraph} aria-pressed={inputMode === 'rotate'} onClick={() => { clearExplanation(); setInputMode(mode => mode === 'rotate' ? 'pan' : 'rotate'); }}>{inputMode === 'rotate' ? '退出旋转' : '旋转视角'}</button>
        <button disabled={!scene || switchingGraph} onClick={() => { void viewAction(instance => instance.resetView()); }}>复位角度</button>
      </div>}
    </div>
    <label className="factory-library"><span>已保存的图</span><select aria-label="已保存的图" value={library.activeId ?? ''}
      disabled={switchingGraph || library.entries.length === 0} onChange={event => { void restoreGraph(event.target.value); }}>
      <option value="" disabled>{library.entries.length ? '选择一张已保存的图' : '还没有保存的图'}</option>
      {library.entries.map(entry => <option key={entry.id} value={entry.id}>{entry.title || '未命名工厂图'}{entry.id === library.activeId ? ' · 当前' : ''}</option>)}
    </select></label>
    {relationView && <section className="factory-message" aria-live="polite" style={{maxHeight:190,overflowY:"auto"}}>
      <strong>{nodeLabel(graph.nodes.find(n => n.id === relationView.id))} · {relationView.kind === 'related' ? '直接关联' : '需要核查的影响范围'}</strong>
      <p>{relationView.kind === 'related' ? '按图中已有连线展示输入、输出与调用关系。' : '这里同时展示调用方与被调用方等相邻关系，避免漏掉返回值变化对调用方的影响。展开后续关联可查看间接关系；是否实际受影响需结合本次代码改动核查。'}</p>
      <p>本次展示 {relationView.nodeIds?.length ?? 0} 个组件。{(relationView.nodeIds ?? []).filter(id => !graph.nodes.find(n => n.id === id)?.data.sourceStatus?.explanationReady).length} 个组件的源码对应尚未核实。图外调用和共享数据需要进一步检查。</p>
      <ul>{relationView.edges.map(edge => <li key={edge.id}>{nodeLabel(graph.nodes.find(n => n.id === edge.source))} → {nodeLabel(graph.nodes.find(n => n.id === edge.target))} · {edge.label || '关系尚未说明'}</li>)}</ul>
      {!relationView.edges.length && <p>现有图没有记录这个组件的直接连线，需结合代码继续核查。</p>}
      {relationView.kind === 'impact' && !relationView.deep && <button onClick={() => componentAction(relationView.id, 'impact', true)}>展开后续关联</button>}
    </section>}
    {library.activeId && presets.length > 0 && <section aria-label="关键视角" className="factory-key-views">
      <nav aria-label="按问题查看" style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        <button aria-pressed={!preset} disabled={!scene || switchingGraph} onClick={() => { exitPreset(); void viewAction(s => s.home(true)); }}>总览</button>
        {presets.map(v => <button key={v.id} aria-pressed={v === preset} disabled={!scene || switchingGraph || v.nodeIds.some(id => !graph.nodes.find(n => n.id === id)?.data.sourceStatus?.explanationReady)}
          onClick={() => { setRelationView(null); setPresetId(v.id); void viewAction(s => s.showPreset(v)); }}>{v.title}</button>)}
      </nav>
      {!preset && <p className="factory-caption">第一次看这个项目？点击上方第一个问题，从用户操作一路看到处理结果。</p>}
      {preset?.stages && <ol style={{margin:'8px 0',paddingLeft:20,lineHeight:1.5,maxHeight:140,overflowY:'auto'}}>
        {preset.stages.map((step, index) => <li key={index}><button disabled={!scene} onClick={() => { void viewAction(s => { s.clearPreset(); return s.focus([step.nodeId]); }); }}>{step.label}</button> {step.text}</li>)}
      </ol>}
      {preset?.caution && <p role="note" style={{color:'#8a5216'}}>{preset.caution}</p>}
      {preset && <p role="status" style={{margin:'6px 0',lineHeight:1.55}}>{preset.summary}</p>}
    </section>}
    {library.activeId && <div className="factory-legend" aria-label="画面信息含义">
      <span title="管道粗细表示明确标记的流程主次；没有实际流量测量。">粗管：主流程 · 箭头：流向</span>
      <span title="外形与占地首先对应设备职责；同类设备再按核验过的代码规模温和调整，不表示性能。">占地：设备类型与代码规模</span>
    </div>}
    {(job || startingGeneration || canRetryGeneration) && <div role="status" aria-live="polite" className="factory-message factory-job" data-state={job?.state}>
      <span>{startingGeneration ? '正在准备制图…' : networkError ? '暂时无法读取工厂图。' : job?.message || '工厂图尚未生成。'}</span>
      {canRetryGeneration && <button onClick={() => { void retryGeneration(); }}>{job?.state === 'failed' || networkError ? '重试' : '更新工厂图'}</button>}
    </div>}
    {!!uncertainNodes.length && <div role="status" className="factory-message factory-binding" data-state="stale">{uncertainNodes.length} 个组件的代码关联待核实，画面依据可能尚未更新。</div>}
    {explanation && explanation.sessionId === sessionId && explanation.graphId === library.activeId && <div ref={explanationElement} role="status" aria-live="polite" className="factory-explanation"
      data-explanation-revision={String(explanation.revision)} data-explanation-session={explanation.sessionId} data-explanation-graph={explanation.graphId}>
      <div className="factory-explanation-heading">当前讲解{explanation.hiddenNodeIds.length ? ' · 范围定位' : ''}</div>
      <p className="factory-explanation-text">{explanation.text}</p>
      {!!explanation.hiddenNodeIds.length && <div className="factory-explanation-status">仍有 {explanation.hiddenNodeIds.length} 个内部组件未显示，需逐个聚焦后查看细节。</div>}
    </div>}
    <div className="factory-view">
      <div ref={container} className="factory-scene" role="group" aria-label="项目组件画布；单击查看，右键打开组件操作，也可使用下方组件按钮" />
      {(!library.activeId || switchingGraph) && <div className="factory-welcome" role="status">
        <strong>{switchingGraph ? '正在打开已保存的图…' : '你想看哪个代码库？'}</strong>
        {!switchingGraph && <><p>在原对话里告诉我，例如“我要看这个后端代码库”，也可以指定几个相关仓库一起看。</p>
          <p className="factory-caption">指定后才开始制图。之后想换图，再告诉原会话助手；已有的图会保留在这里。</p></>}
      </div>}
    </div>
    {library.activeId && <div className="factory-controls">
      <div className="factory-parts" role="group" aria-label="当前可见组件">
        {visibleNodes.map(node => <button key={node.id} className="factory-part"
          disabled={!scene} title={nodeLabel(node)} aria-pressed={selectedId === node.id}
          data-factory-node={node.id} data-factory-role={node.data?.role}
          data-factory-selected={selectedId === node.id ? 'true' : undefined}
          data-factory-highlighted={highlighted.includes(node.id) ? 'true' : undefined}
          aria-haspopup="menu" aria-keyshortcuts="Shift+F10 ContextMenu"
          onContextMenu={event => { event.preventDefault(); openContextMenu({ id: node.id, clientX: event.clientX, clientY: event.clientY }); }}
          onClick={() => selectFromUser(node.id)}>{nodeLabel(node)}</button>)}
        {!visibleNodes.length && <span className="factory-caption">{graph.meta?.empty ? '工厂图准备好后会自动显示。' : '正在显示组件…'}</span>}
      </div>
      <div className="factory-zoom" role="group" aria-label="视图缩放">
        <button disabled={!scene} aria-label="缩小" onClick={() => { void viewAction(instance => instance.zoomBy(1 / 1.2)); }}>−</button>
        <span className="factory-zoom-value" aria-label="当前倍率">{zoom.toFixed(1)}×</span>
        <button disabled={!scene} aria-label="放大" onClick={() => { void viewAction(instance => instance.zoomBy(1.2)); }}>+</button>
      </div>
    </div>}
    {library.activeId && <section className="factory-details" aria-label="组件详情" data-factory-selected={selected?.id}
      data-factory-highlighted={selected && highlighted.includes(selected.id) ? 'true' : undefined}>
      {selected ? <>
        <div className="factory-breadcrumb" aria-label="组件归属">{ownershipPath(selected, graph.nodes)}</div>
        <div className="factory-detail-head">
          <div className="factory-detail-title">{nodeLabel(selected)}</div>
          <button disabled={sending !== null} onClick={() => { void ask(selected.id); }}>{sending === selected.id ? '正在发送…' : '问原会话助手'}</button>
        </div>
        <p className="factory-description">{detailText(detail.annotation ?? detail.description ?? selected.description)}</p>
        <div className="factory-binding" data-state={sourceState}>{sourceLabel}</div>
        <dl className="factory-properties">
          <dt>接收</dt><dd>{detailText(detail.input ?? selected.input)}</dd>
          <dt>交付</dt><dd>{detailText(detail.output ?? selected.output)}</dd>
        </dl>
        <details key={selected.id} className="factory-evidence">
          <summary>查看实现依据</summary>
          <div className="factory-evidence-body"><div className="factory-node-id">组件标识：{selected.id}</div>{sourceText(detail.currentSourceRefs ?? [])}
            <p>{Number.isFinite(detail.codeSize?.lines) ? `关联代码 ${detail.codeSize.lines} 行（含内部组件，重叠只计一次，排除空行和纯注释）；同类设备的大小作温和比较；不同设备的长宽由职责决定。` : '当前无法确认关联代码规模，使用该类设备的标准尺寸。'}</p>
            {!!detail.sourceStatus?.issues?.length && <p>待核实：{detail.sourceStatus.issues.map(detailText).join('；')}</p>}
            {detail.annotation && <p>{detailText(detail.description ?? selected.description)}</p>}
          </div>
        </details>
      </> : graph.meta?.empty
        ? <div className="factory-empty"><strong>{generationBusy ? '正在制图…' : '等待工厂图'}</strong><span>你可以继续原来的对话，工厂图准备好后会在这里显示。</span></div>
        : <div className="factory-empty"><strong>点选组件，查看它做什么。</strong><span>右键选择“@组件”可加入原会话草稿；点击“问原会话助手”才发送问题。</span></div>}
    </section>}
    {networkError && <div role="alert" className="factory-message factory-error">{networkError}</div>}
    {operationError && <div role="alert" className="factory-message factory-error">{operationError}</div>}
    {restoreError && <div role="alert" className="factory-message factory-error">{restoreError}</div>}
    <div role="status" className="factory-message">{notice}</div>
    {contextMenu && menuNode && <div ref={menuElement} role="menu" className="factory-context-menu"
      aria-label={`${nodeLabel(menuNode)}的操作`} style={contextMenu.position}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')];
        const index = items.indexOf(event.target);
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
        if (next !== null) { event.preventDefault(); items[next]?.focus(); }
      }}>
      <div className="factory-menu-title" aria-hidden="true">{nodeLabel(menuNode)}</div>
      <button role="menuitem" onClick={referenceFromMenu}>@组件 · 加入原会话草稿</button>
      {[['enter','进入查看'],['related','查看关联'],['impact','查看影响范围']].map(([kind,label]) => <button key={kind} role="menuitem" onClick={() => {
        const menu = contextMenu;
        if (lifecycle.current === menu.token && !menu.token.signal.aborted) componentAction(menu.id, kind);
      }}>{label}</button>)}
    </div>}
  </div>;
}

function FactoryBody(props) {
  return <FactoryCanvas {...props} />;
}

function OpenFactory({ openFactory }) {
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  return <div style={{ padding: '4px 0' }}>
    <button className="dsh-factory-open" disabled={opening} onClick={async () => {
      setOpening(true);
      setError('');
      try { await openFactory(); } catch (cause) { setError(errorText(cause)); }
      finally { setOpening(false); }
    }}>{opening ? '正在打开…' : '打开SeeThrough'}</button>
    {error && <span role="alert" style={{ color: '#b32b34', marginLeft: 8 }}>{error}</span>}
  </div>;
}

export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'conversation', 'sessions'];

export function apply(ctx) {
  const sessionScope = (sessionId) => {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('SeeThrough需要一个已打开的会话。');
    const binding = ctx.sessions.binding(sessionId);
    if (!binding || binding.session.sessionId !== sessionId) throw new Error('原会话已不可用；未操作其他会话。');
    const scoped = ctx.sessions.scope(sessionId);
    if (!scoped || ctx.sessions.scopeOf(scoped) !== sessionId) throw new Error('会话作用域不匹配。');
    return scoped;
  };

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PLUGIN_ID, kind: TAB_KIND, keepMounted: true,
    title: () => 'SeeThrough',
    guide: [{ id: 'factory', order: 15, title: () => 'SeeThrough', description: () => '查看组件，并在原会话中讨论实现。' }],
  }), 'factory-probe: tab type');

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: PLUGIN_ID,
    inject: (sessionId) => ({
      requestGeneration(graphId, signal) {
        sessionScope(sessionId);
        return graphRequest('generate', sessionId, graphId, signal);
      },
      selectGraph(graphId, signal) {
        sessionScope(sessionId);
        return graphRequest('select', sessionId, graphId, signal);
      },
      insertReference(id, label, target) {
        const scoped = sessionScope(sessionId);
        const input = ctx.conversation.input.for(scoped);
        const insertion = input.actions.captureInsertion();
        // Preserve selected draft text too: insert after the range, never replace it.
        const caret = { ...insertion, start: insertion.end };
        if (!input.actions.insertText(` ${componentReference(id, label, target)} `, caret)) throw new Error('当前草稿忙碌或已变化，未覆盖草稿；请重试。');
        input.actions.persistDraft();
      },
      async askNode(id, label, target) {
        const scoped = sessionScope(sessionId);
        const session = ctx.sessions.sessionOf(scoped);
        if (!session || session.sessionId !== sessionId) throw new Error('原会话已不可用；未向其他会话发送。');
        const result = await ctx.conversation.sendSession(session, `请用普通人能懂的话，先说明 ${componentReference(id, label, target)} 做什么、为什么需要它。结合这张图对应的实现简短回答，具体代码按需再讲，不必套用长篇模板。请结合图讲解。`, [], 'queue');
        if (result.kind !== 'success') throw new Error('问题未被原会话接受，请查看原会话的错误提示后重试。');
      },
    }),
  }, FactoryBody)), 'factory-probe: tab body');

  ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'factory-probe-open', order: 25,
    inject: (sessionId) => ({
      async openFactory() {
        sessionScope(sessionId);
        if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) throw new Error('请先切回这个会话再打开画布。');
        ctx.sidebarRight.openTab(TAB_KIND);
        await enableFactory(sessionId);
      },
    }),
  }, OpenFactory)), 'factory-probe: open button');
}
