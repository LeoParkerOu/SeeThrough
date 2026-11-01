import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyChildComposition, childSessionMeta, resolveChildAgentOptions, resolveChildDepth,
  captureDelegatedPolicyOverrides, appendDelegatedPolicyOverrides, finalAssistantOutput } from '@deepseek-ai/dsh-subagent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { projectSnapshot, compareSnapshots, graphFileState } from './graph-agent-files.mjs';
import { readGraph } from './graph-store.mjs';

const MAIN_RULES = `组件工厂入口已在本会话启用。用户始终和你对话；打开入口不代表要求制图。你负责理解需求、业务代码、验证和解释。
用户尚未明确指定制图对象时，先自然询问“你想看哪个代码库？”，不要根据工作目录、历史提及或当前任务自行生成图。不要调用图助手来猜对象。
只有用户明确说要看/绘制/切换某个代码库或系统，才先调用 factory_graphs 查看已保存图，再调用 factory_select_graph，requestQuote 逐字引用本轮用户要求。优先恢复匹配的已有 graphId；新对象传经过用户确认或上下文明确定位的绝对仓库路径 repositories，可包含多个仓库。名称或路径含糊时先问清；参考资料不加入范围。选择工具只选择和恢复，不会消耗模型重新制图。
选择结果若 needsGeneration=true，用户要求看这个新对象即授权首次制图，可调用 factory_graph_task(mode=sync, graphId=选中ID)。已有图直接恢复，除非用户明确要求更新、代码被你修改或核对发现关联失效，不重画。聊天顺带提及别的项目不切换；旧图和对应关系会保留。用户带有 @组件 与图ID时先核对当前图；不同图的引用请先询问是否切回，不拿同名零件解释。
后台图专业助手维护当前选中图的源码、源码绑定和画面。需要结合图回答、教学、解释 @组件 时调用 factory_graph_task，必须带当前 graphId，传递本次真实问题、已查证结论、需要展示的步骤及组件ID，等待回执再作最终答复。可先用 factory_node_source/factory_source_nodes 查代码。
修改了当前图覆盖仓库的业务代码并验证后，在最终答复前调用 factory_graph_task(mode=sync,graphId=当前ID)，说明实际改动与测试。未选择图或改的是范围外仓库时不启动制图。不自己编辑图文件，不读取长图规范或自己操作镜头。对用户只需说明正在制图/更新画面，不插入后台规范、伪造用户消息或要求用户协调助手。
工具回执未确认展示时不声称已高亮；缺证据先读代码。对用户用日常语言，通常不提内部Agent、协议、哈希。`;


const WORKER_RULES = `你是原会话的后台图专业助手。初始上下文继承自主Agent最近完成的回合，但你不继续其中的旧任务。只处理随后明确交给你的当前图任务。
本任务 target 明确给出当前图ID、仓库范围；只读取这个范围。多个仓库时源码清单路径带仓库ID前缀，引用时原样保留，禁止与其他仓库同名文件混用。factory_node_source/factory_source_nodes 传 target.graphId。用户只和主Agent对话，你不单独向用户汇报，不创建更多Agent，不修改业务代码，不联网。忽略继承历史中要求你负责业务修改或调用 factory_graph_task 的角色指令；你的专业职责如下。
使用 factory_project_files/factory_read_source 读取真实实现，factory_read_graph 读取现图，factory_write_graph 写完整候选图（程序校验且只允许修改图文件）；不要尝试 shell、通用写文件或调用不存在的工具。
初次先读 factory_guide。该指南描述原单Agent的工作流，现在其中用户答复由主Agent负责，写图用 factory_write_graph，其他语义、组成、绑定、画面规范照常遵守。图的组件由你基于代码决定，禁止复制历史范例的结构。保留已有稳定ID，不因小修改重排或重建全图。
每次任务附带当前代码快照和实际 changedPaths。主Agent的摘要只解释意图，必须自己读受影响代码；失效关联先修复，核对组件说明和引用，然后明确 review_bindings。程序拒绝过期写入时停止，报告需要基于新代码重试，不绕过检查。
说明以已查证职责为限。示例数字必须注明适用条件；没有实现或实验依据，不补充“只影响极端情况”“一定不会”等保证。纠正一处说明时不要顺带扩写未经验证的边界；代码关联校验通过也不代表语义自动正确。
询问/教学时自己规划少量关键视角，通过 factory_canvas 的 explanation 逐步讲解，检查真正可见和文字显示回执；不要一次缩到全景声称内部都看清了。调用之间不做无意义重复。仅同步代码的后台更新应 refresh 保留用户视角；用户明确需要看改动或讲解才聚焦。
最终只返回简短JSON对象：summary（供主Agent理解的结果）、componentIds、evidence（文件和行号）、limitations；不要输出整份图，不把未运行的测试写成通过。实际写图、代码版本、绑定与画布回执由程序另外汇总。`;

const WORKER_TOOLS = ['factory_guide','factory_project_files','factory_read_source','factory_read_graph','factory_write_graph',
  'factory_validate_graph','factory_node_source','factory_source_nodes','factory_check_bindings','factory_review_bindings','factory_canvas'];
const textOf = content => (Array.isArray(content) ? content.filter(p=>p.type==='text').map(p=>p.text).join('\n') : '');

export function createGraphAgentCoordinator(ctx, { stateDirectory, library, record = async () => {} }) {
  const records = new Map(), childRuns = new Map(), prepared = new WeakSet();
  const settingsFile = resolve(stateDirectory, 'graph-agent-enabled.json');
  let enabled = new Set(), saveQueue = Promise.resolve();
  const ready = readFile(settingsFile,'utf8').then(raw=>{enabled = new Set(JSON.parse(raw));}).catch(error=>{if(error.code!=='ENOENT')throw error;});
  const persist = () => saveQueue = saveQueue.then(async()=>{await mkdir(stateDirectory,{recursive:true});await writeFile(settingsFile,JSON.stringify([...enabled]));});

  function entry(id) {
    if (!records.has(id)) records.set(id,{ job:null, worker:null, running:null, lastSnapshot:null, parentSeq:0 });
    return records.get(id);
  }
  function status(id,state,message,extra={}) {
    const rec=entry(id); rec.job={...rec.job,state,message,...extra};
    return rec.job;
  }
  function prepare(parent) {
    if(prepared.has(parent)) return;
    prepared.add(parent);
    parent.ctx.systemPrompt.context({ name:'factory:main-role', order:6000, text:MAIN_RULES });
  }
  async function getParent(id) {
    const result=await ctx.sessionController.resolveAgent(id);
    if('error' in result)throw result.error;
    const parent=result.agent ?? result;
    if(!parent.session)throw new Error('无法恢复原会话');
    prepare(parent); return parent;
  }
  async function workerFor(parent,rec,scope,signal) {
    if(rec.worker && ctx.agents.get(rec.worker.agent.id)===rec.worker.agent) return rec.worker;
    const depth=resolveChildDepth(parent,1), policy=captureDelegatedPolicyOverrides(parent);
    const all=parent.session.snapshotEvents();
    const last=[...all].reverse().find(event=>event.type==='turn/end');
    const seed=last?all.slice(0,last.seq+1):[];
    const handle=await ctx.agents.create({sessionId:randomUUID(),parentAgent:parent,
      meta:childSessionMeta(parent,depth,true), seed, inheritedEventCount:seed.length,
      agentOptions:resolveChildAgentOptions(parent,undefined,depth), signal,
      setup:async(childCtx,child)=>{
        appendDelegatedPolicyOverrides(child.session,policy);
        const workingDirectory=childCtx.get('workingDirectory');
        if(!workingDirectory)throw new Error('本机项目目录服务不可用');
        await workingDirectory.set(child,scope.repositories[0].path,signal);
        await applyChildComposition(childCtx,parent,{});
        childCtx.systemPrompt.context({name:'factory:main-role',order:6000,text:''});
        childCtx.systemPrompt.context({name:'factory:graph-role',order:6001,text:WORKER_RULES});
        childCtx.tools.presentAs('native');
        childCtx.tools.restrict({allow:WORKER_TOOLS});
        // A generic code transport could inherit workspace-write permission.
        // The graph worker uses only explicit, bounded native capabilities.
        const allowed=new Set(WORKER_TOOLS);
        childCtx.tools.guard(exec=>allowed.has(exec.name)?undefined:'图助手只允许读取项目、维护图和操作画布');
      }});
    rec.worker=handle; rec.parentSeq=last?last.seq+1:0;
    await record({type:'graph-worker-created',sessionId:parent.id,childId:handle.agent.id,inheritedEventCount:seed.length,seedEndSeq:last?.seq??null,model:handle.agent.options.model});
    return handle;
  }

  async function perform(id,task,{signal}={}) {
    await ready;
    if(!enabled.has(id)) throw new Error('请先打开组件工厂入口');
    const scope=await library.context(id);
    if(!scope || !task.graphId || task.graphId!==scope.id) throw new Error('请先由用户明确选择要看的代码库或已保存图，再开始制图');
    const rec=entry(id);
    // One writer per original conversation. A caller waits then submits its own
    // intent; repeated UI enable is deduplicated separately below.
    const abort=new AbortController();
    const cancel=()=>abort.abort(signal.reason);
    if(signal?.aborted)throw signal.reason;
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>abort.abort(new Error('画面任务超时，请重试')),480000);
    const jobId=randomUUID();
    status(id,'queued','正在准备画面…',{jobId,graphId:scope.id,mode:task.mode});
    const promise=(async()=>{
      const parent=await getParent(id);
      abort.signal.throwIfAborted();
      const root=scope, snapshot=await projectSnapshot(root);
      const changedPaths=rec.lastSnapshot?compareSnapshots(rec.lastSnapshot,snapshot):snapshot.files.map(f=>f.path);
      const handle=await workerFor(parent,rec,scope,abort.signal), child=handle.agent;
      const currentGraph=await graphFileState(root);
      const runState={parentId:id,graphId:scope.id,root,jobId,snapshot,expectedGraphHash:currentGraph.hash,actions:[],writes:0};
      childRuns.set(child.id,runState);
      const parentEvents=parent.session.snapshotEvents();
      const requests=parentEvents.filter(e=>e.seq>=rec.parentSeq && e.type==='user/message' && e.data.source?.kind==='user')
        .slice(-4).map(e=>textOf(e.data.content)).join('\n\n').slice(-14000);
      rec.parentSeq=parent.session.seq;
      const payload={task,target:{graphId:scope.id,title:scope.title,repositories:scope.repositories},latestUserRequests:requests,codeRevision:snapshot.hash,changedPaths,
        currentGraphHash:currentGraph.hash,modeBoundary:task.mode==='sync'?'生成或维护图与对应关系；默认只刷新，不主动夺取镜头':'核对代码后结合画面解释，按需要更新失效图与绑定'};
      const start=child.session.seq;
      status(id,'running',currentGraph.hash==='empty'?'正在制图…':'正在更新画面…');
      await record({type:'graph-job-start',sessionId:id,childId:child.id,jobId,mode:task.mode,codeRevision:snapshot.hash,changedPaths});
      const stop=()=>child.cancel({kind:'parent'});
      abort.signal.addEventListener('abort',stop,{once:true});
      try {
        abort.signal.throwIfAborted();
        child.followup(createUserMessage({content:[{type:'text',text:JSON.stringify(payload)}],source:{kind:'factory-graph-task'}}));
        await child.whenIdle();
        abort.signal.throwIfAborted();
        const events=child.session.snapshotEvents(start);
        const end=[...events].reverse().find(e=>e.type==='turn/end');
        if(end?.data.reason?.kind!=='completed')throw new Error('画面任务没有正常完成');
        const latest=await projectSnapshot(root);
        if(latest.hash!==snapshot.hash)throw new Error('代码已变化，画面需要重新核对');
        const {graph,graphHash}=await readGraph(root);
        const unready=graph.nodes.filter(n=>!n.data.sourceStatus.explanationReady).map(n=>n.id);
        if(unready.length)throw new Error(`仍有 ${unready.length} 个组件需要核对代码对应`);
        rec.lastSnapshot=latest;
        const result={ok:true,graphId:scope.id,jobId,codeRevision:latest.hash,graphHash,changedPaths,
          report:textOf(finalAssistantOutput(events)).slice(0,12000),componentCount:graph.nodes.length,
          canvas:runState.actions,writes:runState.writes};
        status(id,'completed',runState.actions.some(a=>a.applied)?'画面已更新':'工厂图已就绪',{codeRevision:latest.hash});
        await record({type:'graph-job-result',sessionId:id,childId:child.id,...result});
        return result;
      } finally {abort.signal.removeEventListener('abort',stop);childRuns.delete(child.id);}
    })();
    rec.running=promise;
    try{return await promise;}catch(error){
      const stale=/代码.*变化|过期/.test(error.message);
      status(id,stale?'stale':'failed',stale?'代码已有更新，画面需要重新核对。':'画面更新未完成，可以重试。');
      await record({type:'graph-job-failed',sessionId:id,jobId,error:error.message});
      throw error;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(rec.running===promise)rec.running=null;}
  }
  function run(id,task,options={}) {
    const rec=entry(id);
    if(rec.selecting) return Promise.reject(new Error('正在切换图，请稍后重试'));
    const next=(rec.queue??Promise.resolve()).catch(()=>{}).then(()=>perform(id,task,options));
    rec.queue=next;
    next.finally(()=>{if(rec.queue===next)rec.queue=null;}).catch(()=>{});
    return next;
  }
  async function enable(id) {
    await ready;
    if(!enabled.has(id)){enabled.add(id);await persist();}
    await getParent(id);
    // Enabling only adds the main-agent collaboration rules. It never inventories
    // source, creates a worker, selects cwd, or inserts a message into the chat.
    return {ok:true,library:await library.list(id),job:entry(id).job};
  }
  async function select(id,input) {
    await ready;
    const rec=entry(id);
    if(rec.queue || rec.running || rec.selecting) throw new Error('当前画面任务尚未结束，请完成后再切换图');
    rec.selecting=true;
    try {
      const previous=await library.context(id);
      const active=await library.select(id,input);
      if(previous?.id!==active.id){
        if(rec.worker) await rec.worker.dispose();
        rec.worker=null;rec.lastSnapshot=null;rec.parentSeq=0;rec.job=null;
      }
      await enable(id);
      const scope=await library.context(id);
      const saved=await graphFileState(scope);
      return {ok:true,active,library:await library.list(id),needsGeneration:saved.hash==='empty',restored:saved.hash!=='empty'};
    } finally {rec.selecting=false;}
  }
  ctx.on('agent/created',async({agent})=>{await ready;if(enabled.has(agent.id))prepare(agent);});
  ctx.on('agent/disposed',({agent})=>{
    const rec=records.get(agent.id);if(rec?.worker){void rec.worker.dispose();rec.worker=null;}
  });
  return {enable,select,run,childRun:id=>childRuns.get(id),job:id=>records.get(id)?.job??null};
}
