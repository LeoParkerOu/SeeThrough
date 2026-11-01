import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolve, isAbsolute } from 'node:path';
import { readGraph, nodeSource, sourceNodes } from './graph-store.mjs';
import { reviewBindings } from './source-bindings.mjs';
import { layoutHierarchy } from './hierarchy-layout.mjs';
import { planRoutes } from './routing-plan.mjs';
import { createGraphAgentCoordinator } from './graph-agent.mjs';
import { createGraphLibrary } from './graph-library.mjs';
import { requireSelectionRequest } from './selection-request.mjs';
import { projectSnapshot, readProjectFile, graphFileState, commitGraph } from './graph-agent-files.mjs';

export const name = 'seethrough';
export const inject = ['tools', 'connection', 'agents', 'sessionController', 'systemPrompt', 'workingDirectory'];
const stateDirectory = resolve(process.env.DSH_FACTORY_STATE_DIR || resolve(homedir(), '.dsh-component-factory'));
const actions = new Map();
const actionEpoch = randomUUID();
const actionCounters = new Map();
const acknowledgements = new Map();
const output = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };
export function apply(ctx) {
  const library = createGraphLibrary(stateDirectory);
  const graphAgent = createGraphAgentCoordinator(ctx, { stateDirectory, library });
  function scoped(id) {
    if (typeof id !== 'string' || !id) throw new Error('缺少会话 ID');
    const agent = ctx.agents.get(id);
    if (!agent || !isAbsolute(agent.session.header.cwd ?? '')) throw new Error('当前会话没有可用的本地项目目录');
    return agent;
  }
  function tool(name, description, parameters, execute, timeoutMs) {
    ctx.tools.register({ name, description, parameters, output, ...(timeoutMs ? { timeoutMs } : {}), execute: async (args, exec) => {
      const sessionId = exec.agent?.session.id;
      scoped(sessionId);
      exec.signal.throwIfAborted();
      const run = graphAgent.childRun(sessionId);
      if (run && (await projectSnapshot(run.root)).hash !== run.snapshot.hash) throw new Error('代码已变化，当前图任务过期，请基于新代码重试');
      const parentId=run?.parentId ?? sessionId;
      const root=run?.root ?? await library.context(parentId);
      if(!['factory_graphs','factory_select_graph','factory_graph_task'].includes(name) && !root) throw new Error('尚未选择工厂图，请先在原对话中指定想看的代码库');
      if(run && (await library.context(parentId))?.id!==run.graphId) throw new Error('当前图已切换，旧图任务不能操作新画面');
      if(name!=='factory_select_graph' && args.graphId && args.graphId!==root?.id) throw new Error('引用来自另一张图，请先确认是否切回该图');
      const value = await execute(args, parentId, exec.signal, root, run, exec.agent);
      if(run && name==='factory_canvas')run.actions.push(value);
      return value;
    } });
  }
  async function selectTarget(id,input) {
    const result=await graphAgent.select(id,input);
    actions.delete(id);acknowledgements.delete(id);
    return result;
  }
  tool('factory_graphs','只读列出本会话已保存的工厂图与当前选择；不扫描仓库、不调用模型。打开入口后先询问用户想看哪个代码库。',schema({},[]),async(_args,id)=>library.list(id));
  tool('factory_select_graph','仅在用户本轮明确指定要看或切换的代码库时使用。requestQuote逐字引用本轮请求，不得引用代码文件或历史消息。已保存图优先用graphId恢复；新对象传一个或多个已明确的绝对仓库路径。选择不重新制图，旧图保留；返回needsGeneration=true才需要首次sync。范围含糊先问。',schema({graphId:string,title:string,repositories:{type:'array',minItems:1,items:schema({path:string,label:string},['path'])},requestQuote:string},['requestQuote']),async(args,id,_signal,_root,run,agent)=>{
    if(run)throw new Error('图助手不能自行选择或扩大仓库范围');
    requireSelectionRequest(agent,args.requestQuote);
    return selectTarget(id,args);
  });
  tool('factory_graph_task','仅处理当前已明确选择的图。graphId必须匹配当前选择；未选择时先问用户，不根据cwd猜测。新对象首次生成用sync；已有图恢复不重新生成。explain/teach负责结合真实代码讲解；代码更新后sync维护当前图。',schema({graphId:string,mode:{type:'string',enum:['sync','explain','teach']},intent:string,nodeIds:{type:'array',items:string}},['graphId','mode','intent']),
    (args,id,signal)=>graphAgent.run(id,args,{signal}),490000);
  tool('factory_project_files', '图助手只读列出当前项目可分析的源码及内容版本。不包括账号资料、依赖树和生成文件。', schema({},[]), async(_args,_id,_signal,root,run)=> run?.snapshot ?? projectSnapshot(root));
  tool('factory_read_source', '图助手读取当前项目实现，返回带行号文本。每次最多300行；需要后续内容继续指定行号。', schema({path:string,startLine:{type:'integer',minimum:1},endLine:{type:'integer',minimum:1}},['path']),
    (args,_id,_signal,root)=>readProjectFile(root,args.path,args.startLine??1,args.endLine));
  tool('factory_read_graph', '读取完整现有图源码及原始文件版本。首次没有图返回empty；写图时使用这里的fileHash作为expectedGraphHash。',schema({},[]),async(_args,_id,_signal,root)=>{
    const state=await graphFileState(root);return {fileHash:state.hash,graph:state.raw?JSON.parse(state.raw):null};
  });
  tool('factory_write_graph', '仅供后台图助手提交完整图源码JSON字符串。程序先核对代码未变和expectedGraphHash，校验真实引用、层级和管线，再原子写图；不能修改业务代码。',schema({graphJson:string,expectedGraphHash:string},['graphJson','expectedGraphHash']),async(args,_id,_signal,root,run)=>{
    if(!run)throw new Error('图源码由后台图助手维护，请调用factory_graph_task');
    const result=await commitGraph(root,JSON.parse(args.graphJson),{expectedCodeHash:run.snapshot.hash,expectedGraphHash:args.expectedGraphHash});
    run.writes++;return result;
  });
  tool('factory_guide', '首次为当前项目生成组件工厂图时先读取此指南。提供图源码完整格式、职责拆分、接口/细化关系、代码核验及画布协作规则。只操作当前会话项目，不使用别的样例图。', schema({}, []), async () => ({
    guide: await readFile(new URL('./AGENT_GUIDE.md', import.meta.url), 'utf8'),
  }));
  tool('factory_validate_graph', '检查当前项目factory.graph.json的层级、接口、路由和代码引用状态。首次建图或改图后调用；失败返回具体错误，修改图后重试。通过不等于业务含义正确，仍需实际阅读源码。', schema({}, []), async (_args, _id, _signal, root) => {
    try {
      const { graph, graphHash } = await readGraph(root);
      const layout = layoutHierarchy(graph), routes = planRoutes(graph, layout);
      return { valid: true, graphHash, nodes: graph.nodes.map(n => ({ id:n.id, label:n.data.label, parentId:n.data.parentId ?? null, state:n.data.sourceStatus.state })), logicalEdges:graph.edges.length, physicalRoutes:routes.length, summary:graph.meta.sourceIntegrity };
    } catch (error) { return { valid: false, error: error.message }; }
  });
  tool('factory_node_source', '根据稳定组件 ID 定位已核验的当前源码。verified=片段仍一致，relocated=唯一同内容片段已移行；stale/unverified 时 source 为空，禁止根据旧图作重要解释。先实际读取代码并核对图的含义、引用，再用 factory_review_bindings 显式更新基线。此工具不自动背书。', schema({ graphId:string, nodeId: string }, ['graphId','nodeId']), (args, _id, _signal, root) => nodeSource(root, args.nodeId));
  tool('factory_source_nodes', '根据当前代码路径和可选行号反查组件，使用核验后当前位置。nodes 只含可信关联；staleCandidates 仅为历史文件线索，不是当前行号命中。随后可用 factory_canvas 聚焦。', schema({ graphId:string,path: string, line: { type: 'integer', minimum: 1 } }, ['graphId','path']), (args, _id, _signal, root) => sourceNodes(root, args.path, args.line));
  tool('factory_check_bindings', '只读核对全部图与源码绑定，返回状态、当前定位、代码规模及 graphHash。代码规模按父子引用行去重，排除空白/纯注释及依赖/生成文件，不等于复杂度或重要性。不会自动重建基线。', schema({}, []), async (_args, _id, _signal, root) => {
    const { graph, graphHash } = await readGraph(root);
    return { graphHash, summary: graph.meta.sourceIntegrity, nodes: graph.nodes.map(n => ({ nodeId: n.id, label: n.data.label, sourceStatus: n.data.sourceStatus, codeSize: n.data.codeSize })) };
  });
  tool('factory_review_bindings', '只有已实际读取相关实现、核对组件职责/描述及 sourceRefs 后才可调用。明确列出已核验 nodeIds、核验理由 reason 与最新 graphHash；建立这些组件的新片段绑定并留下记录。不得仅为消除警告盲目调用。需要更新旧行号时先修改图源码。此工具不是业务正确性认证。', schema({ nodeIds: { type: 'array', items: string, minItems: 1 }, expectedGraphHash: string, reason: string }, ['nodeIds', 'expectedGraphHash', 'reason']), async (args, _id, _signal, root) => {
    const { updated, reviewedAt, graphHash, graph, note } = await reviewBindings(root, args);
    return { updated, reviewedAt, graphHash, summary: graph.meta.sourceIntegrity, note };
  });
  tool('factory_canvas', '操作本会话右侧工厂图。focus 聚焦且高亮，highlight 仅高亮，clear 清除，refresh 重新读取。解释动作时请带 explanation：一句与当前 nodeIds 对应的中文纯文本（最多240字，不含HTML），随画面同步显示；不要连续移动完后才统一解释。clear/refresh不展示讲解。检查 applied、presented、explanationDisplayed 和 explanationText：applied只确认动作执行，explanationDisplayed才确认这句已显示；partial或hiddenNodeIds非空时仅定位范围，需分步focus后再说内部部件已展示。修改代码后核对说明与引用，显式review_bindings再refresh。', schema({ kind: { type: 'string', enum: ['focus', 'highlight', 'clear', 'refresh'] }, nodeIds: { type: 'array', items: string }, explanation: { type: 'string', maxLength: 240, description: '与当前组件对应的一句中文讲解，纯文本，不含HTML；focus/highlight时显示。' } }, ['kind', 'nodeIds']), async (args, sessionId, signal, root) => {
    if (args.explanation !== undefined && (typeof args.explanation !== 'string' || args.explanation.length > 240 || /<\/?[a-z][^>]*>/i.test(args.explanation))) throw new Error('explanation 必须是最多240字的纯文本，不能包含 HTML');
    const { graph } = await readGraph(root);
    if (args.nodeIds.some(id => !graph.nodes.some(n => n.id === id))) throw new Error('未知组件 ID');
    const count = (actionCounters.get(sessionId) ?? 0) + 1;
    actionCounters.set(sessionId,count);
    const revision = `${actionEpoch}:${count}`;
    const action = { revision, graphId:root.id, ...args };
    actions.set(sessionId, action);
    const until = Date.now() + 5000;
    while (Date.now() < until && !signal.aborted) {
      const ack = acknowledgements.get(sessionId);
      if (ack?.revision === revision) return {
        ...action, applied: ack.status === 'applied',
        ...(ack.presented ? { presented: ack.presented, visibleNodeIds: ack.visibleNodeIds, hiddenNodeIds: ack.hiddenNodeIds, visibleAncestorIds: ack.visibleAncestorIds } : {}),
        explanationDisplayed: ack.status === 'applied' && ack.explanationDisplayed === true,
        explanationText: ack.status === 'applied' && ack.explanationDisplayed === true && typeof ack.explanationText === 'string' ? ack.explanationText : '',
        acknowledgement: ack,
      };
      await new Promise(r => setTimeout(r, 100));
    }
    return { ...action, applied: false, explanationDisplayed: false, explanationText: '', reason: '画布尚未确认，打开本会话工厂画布后重试' };
  });
  function route(path, methods, handler) {
    ctx.effect(() => ctx.connection.fetch.register({ path, methods, requestBody: 'buffered', fetch: async request => {
      try { return Response.json(await handler(request), { headers: { 'Cache-Control': 'no-store' } }); }
      catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    } }));
  }
  route('/api/factory-probe/state', ['GET'], async request => {
    const sessionId = new URL(request.url).searchParams.get('sessionId');
    if(typeof sessionId!=='string'||!sessionId)throw new Error('缺少会话ID');
    await ctx.sessionController.inspect(sessionId);
    const selection=await library.list(sessionId);
    const root=selection.active;
    let state={graphHash:'empty',graph:{project:root?.title??'组件工厂',nodes:[],edges:[],meta:{empty:true,awaitingTarget:!root}}};
    if(root){
      const file=await graphFileState(root);
      if(file.hash!=='empty') state=await readGraph(root);
    }
    return {...state,library:selection,sessionId,job:graphAgent.job(sessionId),action:actions.get(sessionId)??{revision:0,kind:'clear',nodeIds:[],graphId:root?.id??null}};
  });
  route('/api/factory-probe/enable',['POST'],async request=>graphAgent.enable((await request.json()).sessionId));
  route('/api/factory-probe/select',['POST'],async request=>{
    const {sessionId,graphId}=await request.json();
    if(typeof graphId!=='string'||!graphId)throw new Error('请选择已保存的图');
    return selectTarget(sessionId,{graphId});
  });
  route('/api/factory-probe/generate',['POST'],async request=>{
    const {sessionId,graphId}=await request.json();
    const root=await library.context(sessionId);
    if(!root || root.id!==graphId)throw new Error('请先在原对话里明确指定要看的代码库');
    // This request is an explicit retry/update button, never an opening effect.
    void graphAgent.run(sessionId,{graphId,mode:'sync',intent:'用户点击更新或重试当前工厂图，核对代码并更新当前图。'}).catch(()=>{});
    return {ok:true,graphId};
  });
  route('/api/factory-probe/ack', ['POST'], async request => {
    const ack = await request.json();
    if(!actions.has(ack.sessionId))throw new Error('没有待确认的画布动作');
    if (ack.graphId !== (await library.context(ack.sessionId))?.id || ack.graphId !== actions.get(ack.sessionId)?.graphId) throw new Error('画布回执来自另一张图');
    if (ack.revision !== actions.get(ack.sessionId)?.revision) throw new Error('过期画布动作');
    acknowledgements.set(ack.sessionId, ack);
    return { ok: true };
  });
}
