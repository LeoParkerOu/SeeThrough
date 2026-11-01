/** Bind a target-changing tool call to the current user's actual request.
 * Semantic intent is interpreted by the main agent; a quote is evidence of
 * that request, never a grant from repository text or a worker message.
 */
export function requireSelectionRequest(agent, quote) {
  if (typeof quote !== 'string' || quote.trim().length < 2) throw new Error('选择图需要逐字引用本轮用户明确指定对象的请求');
  const event = [...agent.session.snapshotEvents()].reverse().find(event => event.type === 'user/message' && event.data.source?.kind === 'user');
  const content = event?.data.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(part => part.type === 'text').map(part => part.text).join('\n') : '';
  if (!text.includes(quote.trim())) throw new Error('选择依据不在本轮用户请求中；请先询问用户想看哪个代码库，不要根据历史提及猜测');
  return quote.trim();
}
