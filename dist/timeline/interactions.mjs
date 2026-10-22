export const HISTORY_LIMIT = 50;
export function pushHistory(stack, snapshot) {
  stack.push(snapshot);
  if (stack.length > HISTORY_LIMIT) stack.splice(0, stack.length-HISTORY_LIMIT);
}
export function wheelIntent(event) {
  if (event.ctrlKey || event.metaKey) return 'page';
  return event.shiftKey ? 'scroll' : 'timeline';
}
export function panView(origin, dx, dy) {
  return {start:origin.start-dx/origin.ppd,panY:origin.panY+dy};
}
export function zoomView(view, factor, anchor) {
  const date=view.start+anchor/view.ppd;
  const ppd=Math.max(.6,Math.min(55,view.ppd*factor));
  return {start:date-anchor/ppd,ppd};
}
export function historyShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key=event.key.toLowerCase();
  if(key==='z')return event.shiftKey?'redo':'undo';
  if(key==='y')return 'redo';
  return null;
}
